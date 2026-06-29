import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/app-supabase/auth-middleware";

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.from("user_roles").select("role").eq("user_id", ctx.userId);
  const roles = (data ?? []).map((r: any) => r.role);
  if (!roles.includes("admin") && !roles.includes("super_admin")) {
    throw new Error("Forbidden");
  }
}

// ---- Zones (reuses existing public.zones) --------------------------------
const ZoneInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  flat_fee: z.number().nonnegative().default(0),
  eta_minutes: z.number().int().nonnegative().default(30),
  active: z.boolean().default(true),
});

export const listZonesAll = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("zones")
      .select("id, name, flat_fee, eta_minutes, active, created_at")
      .order("name");
    if (error) throw error;
    return data ?? [];
  });

export const upsertZone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ZoneInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/app-supabase/client.server");
    const row: any = { name: data.name, flat_fee: data.flat_fee, eta_minutes: data.eta_minutes, active: data.active };
    if (data.id) row.id = data.id;
    const { error } = await supabaseAdmin.from("zones").upsert(row);
    if (error) throw error;
    return { ok: true as const };
  });

export const deleteZone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/app-supabase/client.server");
    const { error } = await supabaseAdmin.from("zones").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true as const };
  });

// ---- Vehicle types -------------------------------------------------------
const VehicleInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  code: z.string().min(1),
  is_active: z.boolean().default(true),
});

export const listVehicleTypes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("vehicle_types")
      .select("id, name, code, is_active, created_at")
      .order("name");
    if (error) throw error;
    return data ?? [];
  });

export const upsertVehicleType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => VehicleInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/app-supabase/client.server");
    const row: any = { name: data.name, code: data.code, is_active: data.is_active };
    if (data.id) row.id = data.id;
    const { error } = await supabaseAdmin.from("vehicle_types").upsert(row);
    if (error) throw error;
    return { ok: true as const };
  });

export const deleteVehicleType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/app-supabase/client.server");
    const { error } = await supabaseAdmin.from("vehicle_types").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true as const };
  });

// ---- Price matrix --------------------------------------------------------
export const listDeliveryPrices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("delivery_prices")
      .select("id, zone_id, vehicle_type_id, price_per_delivery");
    if (error) throw error;
    return data ?? [];
  });

export const setDeliveryPrice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        zone_id: z.string().uuid(),
        vehicle_type_id: z.string().uuid(),
        price_per_delivery: z.number().nonnegative(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/app-supabase/client.server");
    const { error } = await supabaseAdmin
      .from("delivery_prices")
      .upsert(
        {
          zone_id: data.zone_id,
          vehicle_type_id: data.vehicle_type_id,
          price_per_delivery: data.price_per_delivery,
        },
        { onConflict: "zone_id,vehicle_type_id" },
      );
    if (error) throw error;
    return { ok: true as const };
  });

// ---- Public price lookup (for partner New Order page) -------------------
export const lookupDeliveryPrice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ zone_id: z.string().uuid(), vehicle_type_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("delivery_prices")
      .select("price_per_delivery")
      .eq("zone_id", data.zone_id)
      .eq("vehicle_type_id", data.vehicle_type_id)
      .maybeSingle();
    if (error) throw error;
    return { price: row?.price_per_delivery ?? null };
  });