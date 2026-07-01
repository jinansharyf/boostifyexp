import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/app-supabase/auth-middleware";

const tbl = (sb: any, n: string) => sb.from(n as any);

async function isAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.from("user_roles").select("role").eq("user_id", ctx.userId);
  const roles = (data ?? []).map((r: any) => r.role);
  return roles.includes("admin") || roles.includes("super_admin");
}

export const listOrderFields = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/app-supabase/client.server");
    const { data, error } = await tbl(supabaseAdmin, "order_form_fields")
      .select("*")
      .order("section", { ascending: true })
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data ?? []) as any[];
  });

const FieldInput = z.object({
  id: z.string().uuid().optional(),
  section: z.enum(["customer", "delivery", "other"]),
  label: z.string().min(1).max(120),
  field_key: z.string().min(1).max(60).regex(/^[a-z0-9_]+$/, "lowercase, digits, underscore only"),
  field_type: z.enum(["text", "textarea", "number", "select"]),
  options: z.array(z.string().max(120)).default([]),
  required: z.boolean().default(false),
  active: z.boolean().default(true),
  sort_order: z.number().int().default(0),
});

export const upsertOrderField = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => FieldInput.parse(d))
  .handler(async ({ data, context }) => {
    if (!(await isAdmin(context))) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/app-supabase/client.server");
    const row = { ...data, updated_at: new Date().toISOString() };
    if (data.id) {
      const { error } = await tbl(supabaseAdmin, "order_form_fields").update(row).eq("id", data.id);
      if (error) throw error;
      return { ok: true as const, id: data.id };
    }
    const { data: ins, error } = await tbl(supabaseAdmin, "order_form_fields").insert(row).select("id").single();
    if (error) throw error;
    return { ok: true as const, id: (ins as any).id };
  });

export const deleteOrderField = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    if (!(await isAdmin(context))) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/app-supabase/client.server");
    const { error } = await tbl(supabaseAdmin, "order_form_fields").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true as const };
  });
