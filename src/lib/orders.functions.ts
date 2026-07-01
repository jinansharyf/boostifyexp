import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/app-supabase/auth-middleware";
import { sendViaResend, loadEmailSettings } from "./email.functions";
import { sendTelegram, sendTelegramBroadcast, loadTelegramSettings } from "./telegram.functions";

const tbl = (sb: any, name: string) => sb.from(name as any);

const ORIGIN = process.env.APP_PUBLIC_URL || "https://boostifyexp.vercel.app/";

function esc(s: string) {
  return s.replace(/[&<>]/g, (c) => (({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }) as any)[c]);
}

async function notifyPartnerOfOrder(orderId: string, subject: string, htmlBody: string, tgText: string) {
  try {
    const { supabaseAdmin } = await import("@/integrations/app-supabase/client.server");
    const { data: order } = await tbl(supabaseAdmin, "orders").select("vendor_id").eq("id", orderId).maybeSingle();
    if (!order) return;
    const { data: vendor } = await tbl(supabaseAdmin, "vendors")
      .select("owner_id, business_name")
      .eq("id", (order as any).vendor_id)
      .maybeSingle();
    if (!vendor) return;
    const { data: profile } = await tbl(supabaseAdmin, "profiles")
      .select("email, full_name, telegram_chat_id")
      .eq("id", (vendor as any).owner_id)
      .maybeSingle();
    const emailSettings = await loadEmailSettings().catch(() => null);
    const tgSettings = await loadTelegramSettings().catch(() => null);
    if (emailSettings?.resend_api_key && emailSettings.email_from && profile?.email) {
      await sendViaResend({ to: profile.email, subject, html: htmlBody }).catch(() => {});
    }
    if (tgSettings?.bot_token && (profile as any)?.telegram_chat_id) {
      await sendTelegram(tgText, (profile as any).telegram_chat_id).catch(() => {});
    }
  } catch {
    /* never break order flow */
  }
}

async function notifyStaffOfNewOrder(order: any) {
  try {
    const { supabaseAdmin } = await import("@/integrations/app-supabase/client.server");
    // Find staff assigned to pickup or dropoff zone
    const zoneIds = [order.pickup_zone_id, order.zone_id].filter(Boolean);
    if (zoneIds.length === 0) return;
    const { data: sz } = await tbl(supabaseAdmin, "staff_zones").select("user_id").in("zone_id", zoneIds);
    const userIds = Array.from(new Set((sz ?? []).map((r: any) => r.user_id)));
    if (userIds.length === 0) return;
    const [{ data: members }, { data: profiles }] = await Promise.all([
      tbl(supabaseAdmin, "staff_members").select("user_id, staff_role, telegram_chat_id").in("user_id", userIds),
      tbl(supabaseAdmin, "profiles").select("id, email, full_name").in("id", userIds),
    ]);
    const emailSettings = await loadEmailSettings().catch(() => null);
    const tgSettings = await loadTelegramSettings().catch(() => null);
    const origin = ORIGIN;

    const subject = `New delivery order #${order.tracking_no ?? order.id.slice(0, 8)}`;
    const summary =
      `Customer: ${order.customer_name}\n` +
      `Phone: ${order.customer_phone}\n` +
      `Drop-off: ${order.delivery_address}\n` +
      `Total: ${order.total}`;

    await Promise.allSettled(
      (members ?? []).map(async (m: any) => {
        const p = (profiles ?? []).find((x: any) => x.id === m.user_id);
        if (emailSettings?.resend_api_key && emailSettings.email_from && p?.email) {
          await sendViaResend({
            to: p.email,
            subject,
            html: `<p>Hi ${p.full_name ?? "team"},</p>
                   <p>A new order in your zone needs attention.</p>
                   <pre style="font-family:inherit">${summary.replace(/</g, "&lt;")}</pre>
                   <p><a href="${origin}/staff">Open staff dashboard</a></p>`,
          }).catch(() => {});
        }
        if (tgSettings?.bot_token && m.telegram_chat_id) {
          await sendTelegram(`📦 <b>${subject}</b>\n${summary}\n${origin}/staff`, m.telegram_chat_id).catch(() => {});
        }
      }),
    );
  } catch {
    // never fail the order creation because of notification errors
  }
}

async function broadcastNewOrder(order: any) {
  const trk = order.tracking_no ?? order.id.slice(0, 8);
  const tg =
    `📦 <b>New order #${esc(String(trk))}</b>\n` +
    `Customer: ${esc(order.customer_name)}\n` +
    `Phone: ${esc(order.customer_phone)}\n` +
    `Drop-off: ${esc(order.delivery_address)}\n` +
    `Total: ${order.total}\n` +
    `${ORIGIN}/admin/orders`;
  await sendTelegramBroadcast(tg).catch(() => {});
  // Admin email
  try {
    const emailSettings = await loadEmailSettings();
    if (emailSettings?.resend_api_key && emailSettings.email_from && emailSettings.admin_notification_email) {
      await sendViaResend({
        to: emailSettings.admin_notification_email,
        subject: `New order #${trk}`,
        html: `<p>A new delivery order was created.</p>

               <p><a href="${ORIGIN}/admin/orders">Open admin dashboard</a></p>`,
      }).catch(() => {});
    }
  } catch {}
  // Partner email + DM
  const partnerHtml = `<p>Your order <b>#${esc(String(trk))}</b> was created.</p>
    <pre style="font-family:inherit">Customer: ${esc(order.customer_name)}
Phone: ${esc(order.customer_phone)}
Drop-off: ${esc(order.delivery_address)}
Total: ${order.total}</pre>
    <p><a href="${ORIGIN}/vendor/orders">Track this order</a></p>`;
  await notifyPartnerOfOrder(
    order.id,
    `Order #${trk} created`,
    partnerHtml,
    `📦 Order <b>#${esc(String(trk))}</b> created.\nTotal: ${order.total}\n${ORIGIN}/vendor/orders`,
  );
}

async function broadcastStatusChange(orderId: string, status: string) {
  try {
    const { supabaseAdmin } = await import("@/integrations/app-supabase/client.server");
    const { data: order } = await tbl(supabaseAdmin, "orders")
      .select("id, tracking_no, status, total, customer_name, customer_phone, delivery_address")
      .eq("id", orderId)
      .maybeSingle();
    if (!order) return;
    const trk = (order as any).tracking_no ?? orderId.slice(0, 8);
    const tg =
      `🔔 <b>Order #${esc(String(trk))}</b> → <b>${esc(status)}</b>\n` +
      `Customer: ${esc((order as any).customer_name)}\n` +
      `Drop-off: ${esc((order as any).delivery_address)}`;
    await sendTelegramBroadcast(tg).catch(() => {});
    const partnerHtml = `<p>Your order <b>#${esc(String(trk))}</b> is now <b>${esc(status)}</b>.</p>
      <p><a href="${ORIGIN}/vendor/orders">View order</a></p>`;
    await notifyPartnerOfOrder(
      orderId,
      `Order #${trk} — ${status}`,
      partnerHtml,
      `🔔 Order <b>#${esc(String(trk))}</b> → <b>${esc(status)}</b>\n${ORIGIN}/vendor/orders`,
    );
  } catch {}
}

async function isAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.from("user_roles").select("role").eq("user_id", ctx.userId);
  const roles = (data ?? []).map((r: any) => r.role);
  return roles.includes("admin") || roles.includes("super_admin");
}

const CreateOrderInput = z.object({
  vendor_id: z.string().uuid(),
  pickup_zone_id: z.string().uuid().optional().nullable(),
  dropoff_zone_id: z.string().uuid(),
  vehicle_type_id: z.string().uuid(),
  customer_name: z.string().min(1).max(200),
  customer_phone: z.string().min(3).max(40),
  delivery_address: z.string().min(1).max(500),
  notes: z.string().max(2000).optional().nullable(),
  answers: z.record(z.string(), z.any()).optional().nullable(),
});

export const createOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => CreateOrderInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/app-supabase/client.server");

    // Ownership: partner must own vendor (or be admin)
    const admin = await isAdmin(context);
    let vendorZoneId: string | null = null;
    let vendorAddress: string | null = null;
    if (!admin) {
      const { data: v } = await tbl(supabaseAdmin, "vendors")
        .select("owner_id, zone_id, address")
        .eq("id", data.vendor_id)
        .maybeSingle();
      if (!v || (v as any).owner_id !== context.userId) throw new Error("Forbidden");
      vendorZoneId = (v as any).zone_id ?? null;
      vendorAddress = (v as any).address ?? null;
    } else {
      const { data: v } = await tbl(supabaseAdmin, "vendors")
        .select("zone_id, address")
        .eq("id", data.vendor_id)
        .maybeSingle();
      vendorZoneId = (v as any)?.zone_id ?? null;
      vendorAddress = (v as any)?.address ?? null;
    }

    // Snapshot price from pickup × dropoff × vehicle (with fallbacks)
    const pickupForPrice = data.pickup_zone_id ?? vendorZoneId ?? data.dropoff_zone_id;
    let price = 0;
    const { data: exact } = await tbl(supabaseAdmin, "delivery_prices")
      .select("price_per_delivery")
      .eq("pickup_zone_id", pickupForPrice)
      .eq("zone_id", data.dropoff_zone_id)
      .eq("vehicle_type_id", data.vehicle_type_id)
      .maybeSingle();
    price = Number((exact as any)?.price_per_delivery ?? 0);
    if (!price) {
      // Fallback: any pickup with this dropoff+vehicle
      const { data: any1 } = await tbl(supabaseAdmin, "delivery_prices")
        .select("price_per_delivery")
        .eq("zone_id", data.dropoff_zone_id)
        .eq("vehicle_type_id", data.vehicle_type_id)
        .limit(1)
        .maybeSingle();
      price = Number((any1 as any)?.price_per_delivery ?? 0);
    }
    if (!price || price <= 0) {
      throw new Error("No price configured for this zone + vehicle. Ask admin to set it.");
    }

    const insert: any = {
      vendor_id: data.vendor_id,
      zone_id: data.dropoff_zone_id,
      pickup_zone_id: data.pickup_zone_id ?? vendorZoneId ?? data.dropoff_zone_id,
      vehicle_type_id: data.vehicle_type_id,
      customer_name: data.customer_name,
      customer_phone: data.customer_phone,
      delivery_address: data.delivery_address,
      notes: data.notes ?? null,
      subtotal: 0,
      delivery_fee: price,
      total: price,
      status: "pending",
      items: data.answers ? [{ answers: data.answers, pickup_address: vendorAddress }] : [],
    };
    const { data: created, error } = await tbl(supabaseAdmin, "orders")
      .insert(insert)
      .select("id, tracking_no, total, customer_name, customer_phone, delivery_address, pickup_zone_id, zone_id")
      .single();
    if (error) throw error;
    await Promise.allSettled([notifyStaffOfNewOrder(created), broadcastNewOrder(created)]);
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
      const { data: vendors } = await tbl(supabaseAdmin, "vendors").select("id").eq("owner_id", context.userId);
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
        status: z.enum(["approved", "reject", "picked", "delivered", "cancelled"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/app-supabase/client.server");
    const admin = await isAdmin(context);
    if (!admin) {
      // Partners cannot change status. Delivery staff (manager/supervisor/officer)
      // may only change status of orders in one of their assigned zones.
      const { data: staff } = await tbl(supabaseAdmin, "staff_members")
        .select("staff_role")
        .eq("user_id", context.userId)
        .maybeSingle();
      if (!staff) throw new Error("Only admins and delivery staff can change order status.");
      const { data: zones } = await tbl(supabaseAdmin, "staff_zones").select("zone_id").eq("user_id", context.userId);
      const zids = new Set((zones ?? []).map((z: any) => z.zone_id));
      const { data: ord } = await tbl(supabaseAdmin, "orders")
        .select("zone_id, pickup_zone_id")
        .eq("id", data.id)
        .maybeSingle();
      if (!ord) throw new Error("Order not found");
      if (!zids.has((ord as any).zone_id) && !zids.has((ord as any).pickup_zone_id)) {
        throw new Error("This order is not in one of your assigned zones.");
      }
    }
    const { error } = await tbl(supabaseAdmin, "orders").update({ status: data.status }).eq("id", data.id);
    if (error) throw error;
    broadcastStatusChange(data.id, data.status).catch(() => {});
    return { ok: true as const };
  });
