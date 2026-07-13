import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/app-supabase/auth-middleware";
import { sendViaResend, loadEmailSettings } from "./email.functions";
import { sendTelegram, sendTelegramBroadcast, loadTelegramSettings } from "./telegram.functions";
import { sendSms, getPublicOrigin } from "./sms.functions";

const tbl = (sb: any, name: string) => sb.from(name as any);

// ---------- Editable email templates (from app_settings) ----------
type TemplateKey = "placed" | "ready" | "picked" | "progress";

async function loadEmailTemplate(
  key: TemplateKey,
): Promise<{ enabled: boolean; subject: string; body: string } | null> {
  try {
    const { supabaseAdmin } = await import("@/integrations/app-supabase/client.server");
    const { data } = await (supabaseAdmin.from("app_settings" as any) as any)
      .select(`email_tpl_${key}_subject, email_tpl_${key}_body, email_tpl_${key}_enabled`)
      .eq("id", 1)
      .maybeSingle();
    if (!data) return null;
    return {
      enabled: (data as any)[`email_tpl_${key}_enabled`] ?? true,
      subject: (data as any)[`email_tpl_${key}_subject`] ?? "",
      body: (data as any)[`email_tpl_${key}_body`] ?? "",
    };
  } catch {
    return null;
  }
}

function fillTemplate(tpl: string, vars: Record<string, string | number>): string {
  let out = String(tpl ?? "");
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`{${k}}`).join(String(v ?? ""));
  }
  return out;
}

async function loadSmsChannelToggles() {
  try {
    const { supabaseAdmin } = await import("@/integrations/app-supabase/client.server");
    const { data } = await (supabaseAdmin.from("app_settings" as any) as any)
      .select(
        "sms_send_customer, sms_send_vendor, sms_send_staff, sms_vendor_tpl_ready, sms_staff_tpl_ready",
      )
      .eq("id", 1)
      .maybeSingle();
    return ((data as any) ?? {}) as {
      sms_send_customer?: boolean;
      sms_send_vendor?: boolean;
      sms_send_staff?: boolean;
      sms_vendor_tpl_ready?: string | null;
      sms_staff_tpl_ready?: string | null;
    };
  } catch {
    return {} as any;
  }
}

async function origin() {
  return await getPublicOrigin();
}

function esc(s: string) {
  return String(s ?? "").replace(/[&<>]/g, (c) => (({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }) as any)[c]);
}

// ---------- Recipient helpers ----------

async function notifyPartnerOfOrder(
  orderId: string,
  subject: string,
  htmlBody: string,
  tgText: string,
) {
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
    if (htmlBody && emailSettings?.resend_api_key && emailSettings.email_from && profile?.email) {
      await sendViaResend({ to: profile.email, subject, html: htmlBody }).catch(() => {});
    }
    if (tgSettings?.bot_token && (profile as any)?.telegram_chat_id) {
      await sendTelegram(tgText, (profile as any).telegram_chat_id).catch(() => {});
    }
  } catch {
    /* never break order flow */
  }
}

// Notify staff assigned to the order's pickup/dropoff zones. Filters to
// on_shift staff and uses per-staff notification_email + email toggle.
async function notifyStaffForOrder(
  order: any,
  opts: { subject: string; body: string; tg: string },
) {
  try {
    const { supabaseAdmin } = await import("@/integrations/app-supabase/client.server");
    const zoneIds = [order.pickup_zone_id, order.zone_id].filter(Boolean);
    if (zoneIds.length === 0) return;
    const { data: sz } = await tbl(supabaseAdmin, "staff_zones").select("user_id").in("zone_id", zoneIds);
    const userIds = Array.from(new Set((sz ?? []).map((r: any) => r.user_id)));
    if (userIds.length === 0) return;
    const [{ data: members }, { data: profiles }] = await Promise.all([
      tbl(supabaseAdmin, "staff_members")
        .select("user_id, staff_role, telegram_chat_id, notification_email, email_notifications_enabled, on_shift")
        .in("user_id", userIds),
      tbl(supabaseAdmin, "profiles").select("id, email, full_name").in("id", userIds),
    ]);
    const emailSettings = await loadEmailSettings().catch(() => null);
    const tgSettings = await loadTelegramSettings().catch(() => null);
    await Promise.allSettled(
      (members ?? []).map(async (m: any) => {
        if (m.on_shift === false) return; // only on-shift staff
        const p = (profiles ?? []).find((x: any) => x.id === m.user_id);
        const emailTo = (m.notification_email && String(m.notification_email).trim()) || p?.email;
        if (
          opts.body &&
          emailSettings?.resend_api_key &&
          emailSettings.email_from &&
          emailTo &&
          m.email_notifications_enabled !== false
        ) {
          await sendViaResend({ to: emailTo, subject: opts.subject, html: opts.body }).catch(() => {});
        }
        if (tgSettings?.bot_token && m.telegram_chat_id) {
          await sendTelegram(opts.tg, m.telegram_chat_id).catch(() => {});
        }
      }),
    );
  } catch {
    /* silent */
  }
}

// ---------- Broadcasts by event ----------

async function broadcastNewOrder(order: any) {
  const trk = order.tracking_no ?? order.id.slice(0, 8);
  const originUrl = await origin();
  const vars = {
    tracking: String(trk),
    customer: String(order.customer_name ?? ""),
    phone: String(order.customer_phone ?? ""),
    address: String(order.delivery_address ?? ""),
    total: String(order.total ?? ""),
    link: `${originUrl}/admin/orders`,
    status: "placed",
  };
  const tpl = await loadEmailTemplate("placed");
  const enabled = tpl?.enabled ?? true;
  const subject = fillTemplate(tpl?.subject || "New order #{tracking}", vars);
  const bodyHtml = fillTemplate(
    tpl?.body ||
      `<p>A new order was placed.</p><p>Tracking: <b>#{tracking}</b><br>Customer: {customer}<br>Phone: {phone}<br>Drop-off: {address}<br>Total: {total}</p><p><a href="{link}">Open dashboard</a></p>`,
    vars,
  );

  const tg =
    `📦 <b>New order #${esc(String(trk))}</b>\n` +
    `Customer: ${esc(order.customer_name)}\n` +
    `Phone: ${esc(order.customer_phone)}\n` +
    `Drop-off: ${esc(order.delivery_address)}\n` +
    `Total: ${order.total}\n` +
    `${originUrl}/admin/orders`;
  if (enabled) await sendTelegramBroadcast(tg).catch(() => {});

  // Admin email (uses editable template)
  try {
    const emailSettings = await loadEmailSettings();
    if (enabled && emailSettings?.resend_api_key && emailSettings.email_from && emailSettings.admin_notification_email) {
      await sendViaResend({ to: emailSettings.admin_notification_email, subject, html: bodyHtml }).catch(() => {});
    }
  } catch {}

  // Vendor confirmation
  const vendorVars = { ...vars, link: `${originUrl}/vendor/orders` };
  const vendorSubj = fillTemplate(tpl?.subject || subject, vendorVars);
  const vendorHtml = enabled ? fillTemplate(tpl?.body || bodyHtml, vendorVars) : "";
  await notifyPartnerOfOrder(
    order.id,
    vendorSubj,
    vendorHtml,
    `📦 Order <b>#${esc(String(trk))}</b> created.\nTotal: ${order.total}\n${originUrl}/vendor/orders`,
  );
}

// Vendor flipped accepted → ready_for_pickup. Page admin + on-shift staff.
async function broadcastReadyForPickup(orderId: string) {
  try {
    const { supabaseAdmin } = await import("@/integrations/app-supabase/client.server");
    const { data: order } = await tbl(supabaseAdmin, "orders")
      .select("id, vendor_id, tracking_no, total, customer_name, customer_phone, delivery_address, pickup_zone_id, zone_id")
      .eq("id", orderId)
      .maybeSingle();
    if (!order) return;
    const trk = (order as any).tracking_no ?? orderId.slice(0, 8);
    const originUrl = await origin();
    const vars = {
      tracking: String(trk),
      customer: String((order as any).customer_name ?? ""),
      phone: String((order as any).customer_phone ?? ""),
      address: String((order as any).delivery_address ?? ""),
      total: String((order as any).total ?? ""),
      link: `${originUrl}/staff`,
      status: "ready_for_pickup",
    };
    const tpl = await loadEmailTemplate("ready");
    const enabled = tpl?.enabled ?? true;
    const subject = fillTemplate(tpl?.subject || "Order #{tracking} ready for pickup", vars);
    const body = fillTemplate(
      tpl?.body ||
        `<p>Order <b>#{tracking}</b> is ready for pickup.</p><p>Customer: {customer}<br>Drop-off: {address}<br>Total: {total}</p><p><a href="{link}">Open</a></p>`,
      vars,
    );
    const tg =
      `📦 <b>Ready for pickup #${esc(String(trk))}</b>\n` +
      `Customer: ${esc(String(vars.customer))}\n` +
      `Drop-off: ${esc(String(vars.address))}\n` +
      `${originUrl}/staff`;

    if (enabled) await sendTelegramBroadcast(tg).catch(() => {});

    try {
      const emailSettings = await loadEmailSettings();
      if (enabled && emailSettings?.resend_api_key && emailSettings.email_from && emailSettings.admin_notification_email) {
        await sendViaResend({ to: emailSettings.admin_notification_email, subject, html: body }).catch(() => {});
      }
    } catch {}

    if (enabled) {
      await notifyStaffForOrder(order, { subject, body, tg });
    }

    // Optional SMS to vendor & staff on ready
    const sms = await loadSmsChannelToggles();
    if (sms?.sms_send_vendor && (sms.sms_vendor_tpl_ready ?? "").trim()) {
      const { data: vendor } = await tbl(supabaseAdmin, "vendors")
        .select("owner_id")
        .eq("id", (order as any).vendor_id ?? "")
        .maybeSingle();
      if (vendor) {
        const { data: pv } = await tbl(supabaseAdmin, "profiles")
          .select("phone")
          .eq("id", (vendor as any).owner_id)
          .maybeSingle();
        const phone = (pv as any)?.phone;
        if (phone) await sendSms(phone, fillTemplate(String(sms.sms_vendor_tpl_ready), vars)).catch(() => {});
      }
    }
    if (sms?.sms_send_staff && (sms.sms_staff_tpl_ready ?? "").trim()) {
      // Staff SMS: to profiles.phone of assigned + on-shift staff
      const zoneIds = [(order as any).pickup_zone_id, (order as any).zone_id].filter(Boolean);
      if (zoneIds.length) {
        const { data: sz } = await tbl(supabaseAdmin, "staff_zones").select("user_id").in("zone_id", zoneIds);
        const uids = Array.from(new Set((sz ?? []).map((r: any) => r.user_id)));
        if (uids.length) {
          const { data: mm } = await tbl(supabaseAdmin, "staff_members")
            .select("user_id, on_shift")
            .in("user_id", uids);
          const shift = new Set((mm ?? []).filter((x: any) => x.on_shift !== false).map((x: any) => x.user_id));
          const { data: pfs } = await tbl(supabaseAdmin, "profiles").select("id, phone").in("id", Array.from(shift));
          await Promise.allSettled(
            (pfs ?? [])
              .filter((p: any) => p?.phone)
              .map((p: any) => sendSms(p.phone, fillTemplate(String(sms.sms_staff_tpl_ready), vars)).catch(() => {})),
          );
        }
      }
    }
  } catch {}
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
    const originUrl = await origin();
    const vars = {
      tracking: String(trk),
      customer: String((order as any).customer_name ?? ""),
      phone: String((order as any).customer_phone ?? ""),
      address: String((order as any).delivery_address ?? ""),
      total: String((order as any).total ?? ""),
      link: `${originUrl}/track/${encodeURIComponent(String(trk))}`,
      status,
    };
    const tpl = status === "picked_up" ? await loadEmailTemplate("picked") : await loadEmailTemplate("progress");
    const enabled = tpl?.enabled ?? true;
    const subj = fillTemplate(tpl?.subject || "Order #{tracking} — {status}", vars);
    const html = fillTemplate(
      tpl?.body || `<p>Your order <b>#{tracking}</b> is now <b>{status}</b>.</p><p><a href="{link}">Track</a></p>`,
      { ...vars, link: `${originUrl}/vendor/orders` },
    );

    const tg =
      `🔔 <b>Order #${esc(String(trk))}</b> → <b>${esc(status)}</b>\n` +
      `Customer: ${esc((order as any).customer_name)}\n` +
      `Drop-off: ${esc((order as any).delivery_address)}`;
    await sendTelegramBroadcast(tg).catch(() => {});

    await notifyPartnerOfOrder(
      orderId,
      subj,
      enabled ? html : "",
      `🔔 Order <b>#${esc(String(trk))}</b> → <b>${esc(status)}</b>\n${originUrl}/vendor/orders`,
    );

    // Customer email on picked_up / on_the_way / delivered
    if (enabled && (status === "picked_up" || status === "on_the_way" || status === "delivered")) {
      try {
        const emailSettings = await loadEmailSettings();
        if (emailSettings?.resend_api_key && emailSettings.email_from && (order as any).customer_phone) {
          // No customer email column in this schema — customer emails only fire when captured on the order
          // (falls through to SMS path below).
        }
      } catch {}
    }

    // Customer SMS (admin-editable). Master toggle: sms_send_customer.
    const smsCh = await loadSmsChannelToggles();
    if (smsCh?.sms_send_customer === false) return;
    const tplKeyFor: Record<string, string> = {
      picked: "sms_tpl_picked",
      picked_up: "sms_tpl_picked",
      on_the_way: "sms_tpl_on_the_way",
      delivered: "sms_tpl_delivered",
    };
    const enabledKeyFor: Record<string, string> = {
      picked: "sms_enabled_picked",
      picked_up: "sms_enabled_picked",
      on_the_way: "sms_enabled_on_the_way",
      delivered: "sms_enabled_delivered",
    };
    const tplKey = tplKeyFor[status];
    if (tplKey && (order as any).customer_phone) {
      const enabledKey = enabledKeyFor[status];
      const { data: s } = await tbl(supabaseAdmin, "app_settings")
        .select(`${tplKey}, ${enabledKey}`)
        .eq("id", 1)
        .maybeSingle();
      if ((s as any)?.[enabledKey] === false) return;
      const fallback =
        status === "on_the_way"
          ? "Hi {customer}, your order #{tracking} is on the way to you. Track: {link}"
          : status === "delivered"
          ? "Hi {customer}, your order #{tracking} has been delivered. Thank you! Track: {link}"
          : "Hi {customer}, your order #{tracking} has been picked up and is on the way. Track: {link}";
      const tplSms = ((s as any)?.[tplKey] as string | null) || fallback;
      await sendSms((order as any).customer_phone, fillTemplate(tplSms, vars)).catch(() => {});
    }
  } catch {}
}

async function isAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.from("user_roles").select("role").eq("user_id", ctx.userId);
  const roles = (data ?? []).map((r: any) => r.role);
  return roles.includes("admin") || roles.includes("super_admin");
}

// ---------- Server functions ----------

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
      .select("id, vendor_id, tracking_no, total, customer_name, customer_phone, delivery_address, pickup_zone_id, zone_id")
      .single();
    if (error) throw error;
    // Only notify admin + vendor on placement. Staff are paged when the vendor
    // marks the order as ready_for_pickup.
    await Promise.allSettled([broadcastNewOrder(created)]);
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
        "id, tracking_no, status, total, customer_name, customer_phone, delivery_address, notes, vendor_id, pickup_zone_id, zone_id, vehicle_type_id, created_at, delivered_by",
      )
      .order("created_at", { ascending: false })
      .limit(500);

    const admin = await isAdmin(context);
    if (data.scope === "all") {
      if (!admin) throw new Error("Forbidden");
      if (data.partner_id) q = q.eq("vendor_id", data.partner_id);
    } else {
      const { data: vendors } = await tbl(supabaseAdmin, "vendors").select("id").eq("owner_id", context.userId);
      const ids = (vendors ?? []).map((v: any) => v.id);
      if (ids.length === 0) return [];
      q = q.in("vendor_id", ids);
    }
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw error;
    // Attach delivered-by staff names for admins.
    const staffIds = Array.from(
      new Set((rows ?? []).map((r: any) => r.delivered_by).filter(Boolean)),
    ) as string[];
    let nameMap: Record<string, string> = {};
    if (staffIds.length > 0) {
      const { data: profs } = await tbl(supabaseAdmin, "profiles")
        .select("id, full_name, email")
        .in("id", staffIds);
      for (const p of profs ?? []) {
        nameMap[(p as any).id] = (p as any).full_name || (p as any).email || "";
      }
    }
    return (rows ?? []).map((r: any) => ({
      ...r,
      delivered_by_name: r.delivered_by ? nameMap[r.delivered_by] ?? null : null,
    }));
  });

export const updateOrderStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum([
          "accepted",
          "rejected",
          "ready_for_pickup",
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
    if (data.status === "ready_for_pickup") {
      broadcastReadyForPickup(data.id).catch(() => {});
    } else {
      broadcastStatusChange(data.id, data.status).catch(() => {});
    }
    return { ok: true as const };
  });

// Vendors flip their own order from accepted → ready_for_pickup.
// This is what pages delivery staff (browser/telegram/email).
export const vendorMarkOrderReady = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/app-supabase/client.server");
    const admin = await isAdmin(context);
    const { data: ord } = await tbl(supabaseAdmin, "orders")
      .select("id, vendor_id, status")
      .eq("id", data.id)
      .maybeSingle();
    if (!ord) throw new Error("Order not found");
    if (!admin) {
      const { data: v } = await tbl(supabaseAdmin, "vendors")
        .select("owner_id")
        .eq("id", (ord as any).vendor_id)
        .maybeSingle();
      if (!v || (v as any).owner_id !== context.userId) throw new Error("Forbidden");
    }
    if ((ord as any).status !== "accepted") {
      throw new Error("Only accepted orders can be marked ready.");
    }
    const { error } = await tbl(supabaseAdmin, "orders")
      .update({ status: "ready_for_pickup" })
      .eq("id", data.id);
    if (error) throw error;
    broadcastReadyForPickup(data.id).catch(() => {});
    return { ok: true as const };
  });