import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/app-supabase/auth-middleware";
import { loadEmailSettings, sendViaResend } from "./email.functions";

const Input = z.object({
  thread_id: z.string().uuid(),
  preview: z.string().max(500).optional(),
  has_attachment: z.boolean().optional(),
});

// Throttle: don't email the same recipient about the same thread more than
// once every 2 minutes — avoids flooding inboxes during back-and-forth chats.
const THROTTLE_MS = 2 * 60 * 1000;
const lastSent = new Map<string, number>();

export const notifyNewChatMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => Input.parse(i))
  .handler(async ({ data, context }) => {
    const settings = await loadEmailSettings();
    if (!settings?.resend_api_key || !settings.email_from) return { ok: false as const, reason: "email_not_configured" };

    const { supabaseAdmin } = await import("@/integrations/app-supabase/client.server");

    // Resolve thread → vendor → vendor owner email + sender role.
    const { data: thread } = await supabaseAdmin
      .from("chat_threads")
      .select("id, vendor_id")
      .eq("id", data.thread_id)
      .maybeSingle();
    if (!thread) return { ok: false as const, reason: "thread_not_found" };

    const { data: vendor } = await supabaseAdmin
      .from("vendors")
      .select("id, store_name, owner_id")
      .eq("id", (thread as any).vendor_id)
      .maybeSingle();

    const { data: senderRoles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const senderIsAdmin = (senderRoles ?? []).some((r: any) => r.role === "admin" || r.role === "super_admin");

    let recipient: string | null = null;
    let recipientLabel = "";
    if (senderIsAdmin) {
      // Email the vendor owner.
      if (!vendor?.owner_id) return { ok: false as const, reason: "no_vendor_owner" };
      const { data: ownerProfile } = await supabaseAdmin
        .from("profiles")
        .select("email, full_name")
        .eq("id", vendor.owner_id)
        .maybeSingle();
      recipient = (ownerProfile as any)?.email ?? null;
      recipientLabel = (ownerProfile as any)?.full_name ?? vendor.store_name ?? "there";
    } else {
      // Vendor → notify admin notification email.
      recipient = settings.admin_notification_email;
      recipientLabel = "team";
    }
    if (!recipient) return { ok: false as const, reason: "no_recipient" };

    const key = `${data.thread_id}:${recipient}`;
    const now = Date.now();
    const last = lastSent.get(key) ?? 0;
    if (now - last < THROTTLE_MS) return { ok: false as const, reason: "throttled" };
    lastSent.set(key, now);

    const subject = senderIsAdmin
      ? `New message from Boostify Support`
      : `New message from ${vendor?.store_name ?? "a vendor"}`;
    const preview = data.has_attachment && !data.preview ? "📎 sent an attachment" : (data.preview ?? "");

    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#17202a;max-width:560px;margin:0 auto;padding:24px;">
        <h2 style="margin:0 0 8px;">${escapeHtml(subject)}</h2>
        <p>Hi ${escapeHtml(recipientLabel)},</p>
        <p>You have a new chat message${vendor?.store_name ? ` regarding <strong>${escapeHtml(vendor.store_name)}</strong>` : ""}.</p>
        ${preview ? `<blockquote style="border-left:3px solid #e5e7eb;padding:8px 12px;margin:16px 0;color:#374151;">${escapeHtml(preview)}</blockquote>` : ""}
        <p>Open the messages page to reply.</p>
        <p style="color:#6b7280;font-size:12px;">— Boostify</p>
      </div>`;

    const res = await sendViaResend({ to: recipient, subject, html });
    return res.ok ? { ok: true as const } : { ok: false as const, reason: res.error };
  });

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}