import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/app-supabase/auth-middleware";

const RoleSchema = z.enum(["customer", "vendor", "admin", "super_admin"]);
const PermissionSchema = z.enum([
  "manage_orders",
  "manage_menu",
  "manage_users",
  "manage_settings",
  "manage_vendors",
  "manage_zones",
  "view_reports",
  "manage_chat",
]);

const CreateUserInput = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  full_name: z.string().min(1),
  role: RoleSchema,
  permissions: z.array(PermissionSchema).default([]),
});

async function assertCanManageUsers(ctx: { supabase: any; userId: string }, targetRole: string) {
  const { data: roles } = await ctx.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", ctx.userId);
  const list = (roles ?? []).map((r: any) => r.role as string);
  const isSuper = list.includes("super_admin");
  if (isSuper) return;

  const { data: perms } = await ctx.supabase
    .from("user_permissions")
    .select("permission")
    .eq("user_id", ctx.userId);
  const permList = (perms ?? []).map((p: any) => p.permission as string);

  if (!permList.includes("manage_users")) throw new Error("Forbidden");
  if (targetRole === "admin" || targetRole === "super_admin") {
    throw new Error("Only a super admin can create another admin.");
  }
}

export const createUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => CreateUserInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertCanManageUsers(context, data.role);

    const { supabaseAdmin } = await import("@/integrations/app-supabase/client.server");

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: {
        full_name: data.full_name,
        must_change_password: true,
        role: data.role,
      },
    });
    if (error) throw error;
    if (!created.user) throw new Error("User not returned");

    // The on_auth_user_created trigger seeds profile + role, but it always reads
    // raw_user_meta_data.role. If the role is admin/super_admin we let the trigger handle it.
    // Ensure role is exactly what was asked (cleanup any default 'customer' fallback).
    await supabaseAdmin.from("user_roles").delete().eq("user_id", created.user.id);
    await supabaseAdmin.from("user_roles").insert({ user_id: created.user.id, role: data.role });

    if (data.permissions.length > 0) {
      await supabaseAdmin.from("user_permissions").insert(
        data.permissions.map((permission) => ({ user_id: created.user!.id, permission }))
      );
    }

    return {
      ok: true as const,
      user_id: created.user.id,
      email: data.email,
      temporary_password: data.password,
    };
  });

export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertCanManageUsers(context, "customer");
    const { supabaseAdmin } = await import("@/integrations/app-supabase/client.server");
    const { data: profiles, error } = await supabaseAdmin
      .from("profiles")
      .select("id, email, full_name, created_at, must_change_password")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    const ids = (profiles ?? []).map((p) => p.id);
    const [{ data: roles }, { data: perms }] = await Promise.all([
      supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", ids),
      supabaseAdmin.from("user_permissions").select("user_id, permission").in("user_id", ids),
    ]);
    return (profiles ?? []).map((p) => ({
      ...p,
      roles: (roles ?? []).filter((r) => r.user_id === p.id).map((r) => r.role as string),
      permissions: (perms ?? []).filter((r) => r.user_id === p.id).map((r) => r.permission as string),
    }));
  });

const SetPermissionsInput = z.object({
  user_id: z.string().uuid(),
  permissions: z.array(PermissionSchema),
});

export const setPermissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => SetPermissionsInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertCanManageUsers(context, "customer");
    const { supabaseAdmin } = await import("@/integrations/app-supabase/client.server");
    await supabaseAdmin.from("user_permissions").delete().eq("user_id", data.user_id);
    if (data.permissions.length > 0) {
      await supabaseAdmin.from("user_permissions").insert(
        data.permissions.map((permission) => ({ user_id: data.user_id, permission }))
      );
    }
    return { ok: true as const };
  });
