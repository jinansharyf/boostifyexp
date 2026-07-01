import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/app-supabase/auth-middleware";

const tbl = (sb: any, name: string) => sb.from(name as any);

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.from("user_roles").select("role").eq("user_id", ctx.userId);
  const roles = (data ?? []).map((r: any) => r.role);
  if (!roles.includes("admin") && !roles.includes("super_admin")) throw new Error("Forbidden");
}

const StaffRole = z.enum(["manager", "supervisor", "officer"]);

const CreateStaffInput = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  full_name: z.string().min(1),
  staff_role: StaffRole,
  zone_ids: z.array(z.string().uuid()).default([]),
});

export const createStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => CreateStaffInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/app-supabase/client.server");

    // Try to find existing auth user by email
    let userId: string | null = null;
    const { data: prof } = await tbl(supabaseAdmin, "profiles")
      .select("id")
      .eq("email", data.email)
      .maybeSingle();
    if (prof) {
      userId = (prof as any).id;
    } else {
      const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
        email: data.email,
        password: data.password,
        email_confirm: true,
        user_metadata: { full_name: data.full_name, must_change_password: true, role: "customer" },
      });
      if (error) throw error;
      userId = created.user!.id;
    }

    await tbl(supabaseAdmin, "staff_members")
      .upsert({ user_id: userId, staff_role: data.staff_role }, { onConflict: "user_id" });

    // Replace zone assignments
    await tbl(supabaseAdmin, "staff_zones").delete().eq("user_id", userId);
    if (data.zone_ids.length > 0) {
      await tbl(supabaseAdmin, "staff_zones").insert(
        data.zone_ids.map((zone_id) => ({ user_id: userId, zone_id })),
      );
    }

    return { ok: true as const, user_id: userId, temporary_password: data.password };
  });

export const listStaff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/app-supabase/client.server");
    const { data: members } = await tbl(supabaseAdmin, "staff_members")
      .select("user_id, staff_role, created_at")
      .order("created_at", { ascending: false });
    const ids = (members ?? []).map((m: any) => m.user_id);
    if (ids.length === 0) return [];
    const [{ data: profiles }, { data: zones }] = await Promise.all([
      tbl(supabaseAdmin, "profiles").select("id, email, full_name").in("id", ids),
      tbl(supabaseAdmin, "staff_zones").select("user_id, zone_id").in("user_id", ids),
    ]);
    return (members ?? []).map((m: any) => ({
      user_id: m.user_id,
      staff_role: m.staff_role,
      created_at: m.created_at,
      email: (profiles ?? []).find((p: any) => p.id === m.user_id)?.email ?? null,
      full_name: (profiles ?? []).find((p: any) => p.id === m.user_id)?.full_name ?? null,
      zone_ids: (zones ?? []).filter((z: any) => z.user_id === m.user_id).map((z: any) => z.zone_id),
    }));
  });

const SetStaffZonesInput = z.object({
  user_id: z.string().uuid(),
  staff_role: StaffRole.optional(),
  zone_ids: z.array(z.string().uuid()),
});

export const updateStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => SetStaffZonesInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/app-supabase/client.server");
    if (data.staff_role) {
      await tbl(supabaseAdmin, "staff_members")
        .update({ staff_role: data.staff_role })
        .eq("user_id", data.user_id);
    }
    await tbl(supabaseAdmin, "staff_zones").delete().eq("user_id", data.user_id);
    if (data.zone_ids.length > 0) {
      await tbl(supabaseAdmin, "staff_zones").insert(
        data.zone_ids.map((zone_id) => ({ user_id: data.user_id, zone_id })),
      );
    }
    return { ok: true as const };
  });

export const removeStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ user_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/app-supabase/client.server");
    await tbl(supabaseAdmin, "staff_members").delete().eq("user_id", data.user_id);
    await tbl(supabaseAdmin, "staff_zones").delete().eq("user_id", data.user_id);
    return { ok: true as const };
  });

// Self: what staff role + zones do I have?
export const getMyStaff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/app-supabase/client.server");
    const { data: m } = await tbl(supabaseAdmin, "staff_members")
      .select("staff_role")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!m) return null;
    const { data: zones } = await tbl(supabaseAdmin, "staff_zones")
      .select("zone_id")
      .eq("user_id", context.userId);
    return {
      staff_role: (m as any).staff_role as "manager" | "supervisor" | "officer",
      zone_ids: (zones ?? []).map((z: any) => z.zone_id) as string[],
    };
  });

// Orders visible to the signed-in staff member (by pickup or dropoff zone)
export const listStaffOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ status: z.string().optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/app-supabase/client.server");
    const { data: m } = await tbl(supabaseAdmin, "staff_members")
      .select("staff_role")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!m) throw new Error("Not a staff member");
    const { data: zones } = await tbl(supabaseAdmin, "staff_zones")
      .select("zone_id")
      .eq("user_id", context.userId);
    const zids = (zones ?? []).map((z: any) => z.zone_id);
    if (zids.length === 0) return { role: (m as any).staff_role, orders: [] };

    let q = tbl(supabaseAdmin, "orders")
      .select(
        "id, tracking_no, status, total, customer_name, customer_phone, delivery_address, notes, vendor_id, pickup_zone_id, zone_id, vehicle_type_id, created_at",
      )
      .or(
        `zone_id.in.(${zids.join(",")}),pickup_zone_id.in.(${zids.join(",")})`,
      )
      .order("created_at", { ascending: false })
      .limit(500);
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw error;
    return { role: (m as any).staff_role as string, orders: rows ?? [] };
  });

// Officers may update status of orders in their zones
export const staffUpdateOrderStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum([
          "pending",
          "accepted",
          "preparing",
          "picked_up",
          "on_the_way",
          "delivered",
          "cancelled",
        ]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/app-supabase/client.server");
    const { data: zones } = await tbl(supabaseAdmin, "staff_zones")
      .select("zone_id")
      .eq("user_id", context.userId);
    const zids = new Set((zones ?? []).map((z: any) => z.zone_id));
    if (zids.size === 0) throw new Error("Forbidden");
    const { data: ord } = await tbl(supabaseAdmin, "orders")
      .select("zone_id, pickup_zone_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!ord) throw new Error("Order not found");
    if (!zids.has((ord as any).zone_id) && !zids.has((ord as any).pickup_zone_id)) {
      throw new Error("Not in your assigned zones");
    }
    const { error } = await tbl(supabaseAdmin, "orders")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true as const };
  });
