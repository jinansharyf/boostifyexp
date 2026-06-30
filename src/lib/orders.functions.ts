import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/app-supabase/auth-middleware";

const tbl = (sb: any, name: string) => sb.from(name as any);

async function isAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.from("user_roles").select("role").eq("user_id", ctx.userId);
  const roles = (data ?? []).map((r: any) => r.role);
  return roles.includes("admin") || roles.includes("super_admin");
}

const CreateOrderInput = z.object({
  vendor_id: z.string().uuid(),
  pickup_zone_id: z.string().uuid(),
  dropoff_zone_id: z.string().uuid(),
  vehicle_type_id: z.string().uuid(),
  customer_name: z.string().min(1).max(200),
  customer_phone: z.string().min(3).max(40),
  delivery_address: z.string().min(1).max(500),
  notes: z.string().max(2000).optional().nullable(),
});

export const createOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => CreateOrderInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/app-supabase/client.server");

    // Ownership: partner must own vendor (or be admin)
    const admin = await isAdmin(context);
    if (!admin) {
      const { data: v } = await tbl(supabaseAdmin, "vendors")
        .select("owner_id")
        .eq("id", data.vendor_id)
        .maybeSingle();
      if (!v || (v as any).owner_id !== context.userId) throw new Error("Forbidden");
    }

    // Snapshot price from dropoff zone × vehicle
    const { data: priceRow } = await tbl(supabaseAdmin, "delivery_prices")
      .select("price_per_delivery")
      .eq("zone_id", data.dropoff_zone_id)
      .eq("vehicle_type_id", data.vehicle_type_id)
      .maybeSingle();
    const price = Number((priceRow as any)?.price_per_delivery ?? 0);
    if (!price || price <= 0) {
      throw new Error("No price configured for this zone + vehicle. Ask admin to set it.");
    }

    const insert: any = {
      vendor_id: data.vendor_id,
      zone_id: data.dropoff_zone_id,
      pickup_zone_id: data.pickup_zone_id,
      vehicle_type_id: data.vehicle_type_id,
      customer_name: data.customer_name,
      customer_phone: data.customer_phone,
      delivery_address: data.delivery_address,
      notes: data.notes ?? null,
      subtotal: 0,
      delivery_fee: price,
      total: price,
      status: "pending",
      items: [],
    };
    const { data: created, error } = await tbl(supabaseAdmin, "orders")
      .insert(insert)
      .select("id, tracking_no, total")
      .single();
    if (error) throw error;
    return created;
  });

export const listOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        scope: z.enum(["mine", "all"]).default("mine"),
        status: z.string().optional(),
        partner_id: z.string().uuid().optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/app-supabase/client.server");
    let q = tbl(supabaseAdmin, "orders")
      .select(
        "id, tracking_no, status, total, customer_name, customer_phone, delivery_address, notes, vendor_id, pickup_zone_id, zone_id, vehicle_type_id, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(500);

    const admin = await isAdmin(context);
    if (data.scope === "all") {
      if (!admin) throw new Error("Forbidden");
      if (data.partner_id) q = q.eq("vendor_id", data.partner_id);
    } else {
      // mine: partner sees own
      const { data: vendors } = await tbl(supabaseAdmin, "vendors")
        .select("id")
        .eq("owner_id", context.userId);
      const ids = (vendors ?? []).map((v: any) => v.id);
      if (ids.length === 0) return [];
      q = q.in("vendor_id", ids);
    }
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

export const updateOrderStatus = createServerFn({ method: "POST" })
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
    const admin = await isAdmin(context);
    if (!admin) {
      // Partners may update only their own orders
      const { data: row } = await tbl(supabaseAdmin, "orders")
        .select("vendor_id")
        .eq("id", data.id)
        .maybeSingle();
      if (!row) throw new Error("Order not found");
      const { data: v } = await tbl(supabaseAdmin, "vendors")
        .select("owner_id")
        .eq("id", (row as any).vendor_id)
        .maybeSingle();
      if (!v || (v as any).owner_id !== context.userId) throw new Error("Forbidden");
    }
    const { error } = await tbl(supabaseAdmin, "orders")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true as const };
  });