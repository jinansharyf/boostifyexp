import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/app-supabase/auth-middleware";
import { sendViaResend, loadEmailSettings } from "./email.functions";
import { sendTelegram, loadTelegramSettings } from "./telegram.functions";
import { broadcastOrderStatusChangeForNotifications } from "./orders.functions";

const tbl = (sb: any, name: string) => sb.from(name as any);

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!),
  );
}

const APP_ORIGIN = () =>
  process.env.APP_PUBLIC_URL || "https://boostifyexp.vercel.app";

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
  telegram_chat_id: z.string().max(64).optional().nullable(),
  notification_email: z.string().email().max(200).optional().nullable(),
  email_notifications_enabled: z.boolean().optional(),
  on_shift: z.boolean().optional(),
  phone: z.string().max(32).optional().nullable(),
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

    // Save mobile number on the profile so SMS templates can reach this staff
    if (data.phone !== undefined) {
      await tbl(supabaseAdmin, "profiles")
        .update({ phone: (data.phone ?? "").trim() || null })
        .eq("id", userId);
    }

    await tbl(supabaseAdmin, "staff_members")
      .upsert(
        {
          user_id: userId,
          staff_role: data.staff_role,
          telegram_chat_id: data.telegram_chat_id ?? null,
          notification_email: data.notification_email ?? null,
          email_notifications_enabled: data.email_notifications_enabled ?? true,
          on_shift: data.on_shift ?? true,
        },
        { onConflict: "user_id" },
      );

    // Replace zone assignments
    await tbl(supabaseAdmin, "staff_zones").delete().eq("user_id", userId);
    if (data.zone_ids.length > 0) {
      await tbl(supabaseAdmin, "staff_zones").insert(
        data.zone_ids.map((zone_id) => ({ user_id: userId, zone_id })),
      );
    }

    const origin = APP_ORIGIN();
    try {
      const settings = await loadEmailSettings();
      if (settings?.resend_api_key && settings.email_from) {
        await sendViaResend({
          to: data.email,
          subject: `Your Boostify ${data.staff_role} account is ready`,
          html: `<p>Hi ${escapeHtml(data.full_name)},</p>
                 <p>You have been added to Boostify as a <strong>${escapeHtml(data.staff_role)}</strong>.</p>
                 <p>Sign in with:</p>
                 <ul>
                   <li><strong>Email:</strong> ${escapeHtml(data.email)}</li>
                   <li><strong>Temporary password:</strong> ${escapeHtml(data.password)}</li>
                 </ul>
                 <p><a href="${origin}/auth">Sign in</a> and change your password after your first login.</p>`,
        });
      }
    } catch {
      // ignore email errors
    }

    try {
      const tg = await loadTelegramSettings();
      if (tg?.bot_token) {
        if (data.telegram_chat_id) {
          await sendTelegram(
            `👋 <b>Welcome to Boostify</b>\n` +
              `Role: ${data.staff_role}\n` +
              `Email: ${data.email}\n` +
              `Temp password: <code>${data.password}</code>\n` +
              `Sign in: ${origin}/auth`,
            data.telegram_chat_id,
          );
        }
        if (tg.admin_chat_id) {
          await sendTelegram(
            `👤 <b>New delivery ${data.staff_role}</b>\n` +
              `Name: ${data.full_name}\n` +
              `Email: ${data.email}`,
          );
        }
      }
    } catch {
      // ignore telegram errors
    }

    return { ok: true as const, user_id: userId, temporary_password: data.password };
  });

export const listStaff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/app-supabase/client.server");
    const { data: members } = await tbl(supabaseAdmin, "staff_members")
      .select("user_id, staff_role, telegram_chat_id, notification_email, email_notifications_enabled, on_shift, created_at")
      .order("created_at", { ascending: false });
    const ids = (members ?? []).map((m: any) => m.user_id);
    if (ids.length === 0) return [];
    const [{ data: profiles }, { data: zones }] = await Promise.all([
      tbl(supabaseAdmin, "profiles").select("id, email, full_name, phone").in("id", ids),
      tbl(supabaseAdmin, "staff_zones").select("user_id, zone_id").in("user_id", ids),
    ]);
    return (members ?? []).map((m: any) => ({
      user_id: m.user_id,
      staff_role: m.staff_role,
      telegram_chat_id: m.telegram_chat_id ?? null,
      notification_email: m.notification_email ?? null,
      email_notifications_enabled: m.email_notifications_enabled ?? true,
      on_shift: m.on_shift ?? true,
      created_at: m.created_at,
      email: (profiles ?? []).find((p: any) => p.id === m.user_id)?.email ?? null,
      full_name: (profiles ?? []).find((p: any) => p.id === m.user_id)?.full_name ?? null,
      phone: (profiles ?? []).find((p: any) => p.id === m.user_id)?.phone ?? null,
      zone_ids: (zones ?? []).filter((z: any) => z.user_id === m.user_id).map((z: any) => z.zone_id),
    }));
  });

const SetStaffZonesInput = z.object({
  user_id: z.string().uuid(),
  staff_role: StaffRole.optional(),
  zone_ids: z.array(z.string().uuid()),
  telegram_chat_id: z.string().max(64).nullable().optional(),
  notification_email: z.string().max(200).nullable().optional(),
  email_notifications_enabled: z.boolean().optional(),
  on_shift: z.boolean().optional(),
  phone: z.string().max(32).nullable().optional(),
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
    if (data.telegram_chat_id !== undefined) {
      await tbl(supabaseAdmin, "staff_members")
        .update({ telegram_chat_id: data.telegram_chat_id })
        .eq("user_id", data.user_id);
    }
    if (data.notification_email !== undefined) {
      await tbl(supabaseAdmin, "staff_members")
        .update({ notification_email: data.notification_email })
        .eq("user_id", data.user_id);
    }
    if (data.email_notifications_enabled !== undefined) {
      await tbl(supabaseAdmin, "staff_members")
        .update({ email_notifications_enabled: data.email_notifications_enabled })
        .eq("user_id", data.user_id);
    }
    if (data.on_shift !== undefined) {
      await tbl(supabaseAdmin, "staff_members")
        .update({ on_shift: data.on_shift })
        .eq("user_id", data.user_id);
    }
    if (data.phone !== undefined) {
      await tbl(supabaseAdmin, "profiles")
        .update({ phone: (data.phone ?? "").trim() || null })
        .eq("id", data.user_id);
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
      .select("staff_role, on_shift, notification_email, email_notifications_enabled, telegram_chat_id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!m) return null;
    const { data: zones } = await tbl(supabaseAdmin, "staff_zones")
      .select("zone_id")
      .eq("user_id", context.userId);
    return {
      staff_role: (m as any).staff_role as "manager" | "supervisor" | "officer",
      on_shift: (m as any).on_shift !== false,
      notification_email: (m as any).notification_email ?? null,
      email_notifications_enabled: (m as any).email_notifications_enabled !== false,
      telegram_chat_id: (m as any).telegram_chat_id ?? null,
      zone_ids: (zones ?? []).map((z: any) => z.zone_id) as string[],
    };
  });

// Staff toggles their own shift status; logs the event to staff_duty_logs.
export const toggleMyShift = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ on_shift: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/app-supabase/client.server");
    const { data: m } = await tbl(supabaseAdmin, "staff_members")
      .select("user_id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!m) throw new Error("Not a staff member");
    await tbl(supabaseAdmin, "staff_members")
      .update({ on_shift: data.on_shift })
      .eq("user_id", context.userId);
    await tbl(supabaseAdmin, "staff_duty_logs").insert({
      user_id: context.userId,
      action: data.on_shift ? "on" : "off",
    });
    return { ok: true as const, on_shift: data.on_shift };
  });

// Admin: list duty logs across all staff (most recent first).
export const listDutyLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({ user_id: z.string().uuid().optional(), limit: z.number().int().min(1).max(500).optional() })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/app-supabase/client.server");
    let q = tbl(supabaseAdmin, "staff_duty_logs")
      .select("id, user_id, action, created_at")
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 200);
    if (data.user_id) q = q.eq("user_id", data.user_id);
    const { data: logs, error } = await q;
    if (error) throw error;
    const ids = Array.from(new Set((logs ?? []).map((l: any) => l.user_id)));
    let profMap: Record<string, { email: string | null; full_name: string | null }> = {};
    if (ids.length > 0) {
      const { data: profiles } = await tbl(supabaseAdmin, "profiles")
        .select("id, email, full_name")
        .in("id", ids);
      for (const p of profiles ?? []) {
        profMap[(p as any).id] = { email: (p as any).email, full_name: (p as any).full_name };
      }
    }
    return (logs ?? []).map((l: any) => ({
      id: l.id,
      user_id: l.user_id,
      action: l.action as "on" | "off",
      created_at: l.created_at,
      email: profMap[l.user_id]?.email ?? null,
      full_name: profMap[l.user_id]?.full_name ?? null,
    }));
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
    const role = (m as any).staff_role as "manager" | "supervisor" | "officer";
    const { data: zones } = await tbl(supabaseAdmin, "staff_zones")
      .select("zone_id")
      .eq("user_id", context.userId);
    const zids = (zones ?? []).map((z: any) => z.zone_id);
    if (zids.length === 0) return { role, orders: [] };

    let q = tbl(supabaseAdmin, "orders")
      .select(
        "id, tracking_no, status, total, customer_name, customer_phone, delivery_address, notes, vendor_id, pickup_zone_id, zone_id, vehicle_type_id, created_at, picked_by, delivered_by",
      )
      .or(
        `zone_id.in.(${zids.join(",")}),pickup_zone_id.in.(${zids.join(",")})`,
      )
      .order("created_at", { ascending: false })
      .limit(500);
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw error;
    const visibleRows = role === "officer"
      ? (rows ?? []).filter((r: any) => !r.picked_by || r.picked_by === context.userId)
      : (rows ?? []);

    // Attach vendor (business) name + logo so staff know where to pick up.
    const vendorIds = Array.from(
      new Set(visibleRows.map((r: any) => r.vendor_id).filter(Boolean)),
    );
    let vendorMap: Record<string, { store_name: string; logo_url: string | null; address: string | null; phone: string | null }> = {};
    if (vendorIds.length > 0) {
      const { data: vs } = await tbl(supabaseAdmin, "vendors")
        .select("id, store_name, logo_url, address, phone")
        .in("id", vendorIds);
      for (const v of vs ?? []) {
        vendorMap[(v as any).id] = {
          store_name: (v as any).store_name,
          logo_url: (v as any).logo_url ?? null,
          address: (v as any).address ?? null,
          phone: (v as any).phone ?? null,
        };
      }
    }
    const staffIds = Array.from(new Set(visibleRows.flatMap((r: any) => [r.picked_by, r.delivered_by]).filter(Boolean))) as string[];
    let staffMap: Record<string, string> = {};
    if (staffIds.length > 0) {
      const { data: profs } = await tbl(supabaseAdmin, "profiles")
        .select("id, full_name, email")
        .in("id", staffIds);
      for (const p of profs ?? []) staffMap[(p as any).id] = (p as any).full_name || (p as any).email || "";
    }

    const orders = visibleRows.map((r: any) => ({
      ...r,
      vendor: r.vendor_id ? vendorMap[r.vendor_id] ?? null : null,
      picked_by_name: r.picked_by ? staffMap[r.picked_by] ?? null : null,
      delivered_by_name: r.delivered_by ? staffMap[r.delivered_by] ?? null : null,
    }));
    return { role, orders };
  });

// Officers may update status of orders in their zones
export const staffUpdateOrderStatus = createServerFn({ method: "POST" })
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
    const { data: zones } = await tbl(supabaseAdmin, "staff_zones")
      .select("zone_id")
      .eq("user_id", context.userId);
    const zids = new Set((zones ?? []).map((z: any) => z.zone_id));
    if (zids.size === 0) throw new Error("Forbidden");
    const { data: ord } = await tbl(supabaseAdmin, "orders")
      .select("zone_id, pickup_zone_id, picked_by")
      .eq("id", data.id)
      .maybeSingle();
    if (!ord) throw new Error("Order not found");
    if (!zids.has((ord as any).zone_id) && !zids.has((ord as any).pickup_zone_id)) {
      throw new Error("Not in your assigned zones");
    }
    const { data: member } = await tbl(supabaseAdmin, "staff_members")
      .select("staff_role")
      .eq("user_id", context.userId)
      .maybeSingle();
    const role = (member as any)?.staff_role as string | undefined;
    if (role === "officer" && (ord as any).picked_by && (ord as any).picked_by !== context.userId) {
      throw new Error("This order has already been picked by another staff member.");
    }
    const { error } = await tbl(supabaseAdmin, "orders")
      .update({
        status: data.status,
        ...(data.status === "picked_up" ? { picked_by: context.userId } : {}),
        ...(data.status === "delivered" ? { delivered_by: context.userId, picked_by: (ord as any).picked_by ?? context.userId } : {}),
      })
      .eq("id", data.id);
    if (error) throw error;
    broadcastOrderStatusChangeForNotifications(data.id, data.status).catch(() => {});
    return { ok: true as const };
  });
