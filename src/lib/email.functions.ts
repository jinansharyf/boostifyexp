import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/app-supabase/auth-middleware";

type EmailSettings = {
  resend_api_key: string | null;
  email_from: string | null;
  email_from_name: string | null;
  admin_notification_email: string | null;
};

export async function loadEmailSettings(): Promise<EmailSettings | null> {
  const { supabaseAdmin } = await import("@/integrations/app-supabase/client.server");
  const { data, error } = await (supabaseAdmin.from("email_settings" as any) as any)
    .select("resend_api_key, email_from, email_from_name, admin_notification_email")
    .eq("id", 1)
    .maybeSingle();
  if (error) return null;
  return (data as unknown as EmailSettings) ?? null;
}

export async function sendViaResend(opts: {
  to: string | string[];
  subject: string;
  html: string;
}): Promise<{ ok: true; id?: string } | { ok: false; error: string }> {
  const settings = await loadEmailSettings();
  if (!settings?.resend_api_key) return { ok: false, error: "Resend API key not configured" };
  if (!settings.email_from) return { ok: false, error: "Email 'from' address not configured" };

  const from = settings.email_from_name
    ? `${settings.email_from_name} <${settings.email_from}>`
    : settings.email_from;

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.resend_api_key}`,
    },
    body: JSON.stringify({
      from,
      to: Array.isArray(opts.to) ? opts.to : [opts.to],
      subject: opts.subject,
      html: opts.html,
    }),
  });
  const body: any = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    return { ok: false, error: body?.message ?? `Resend ${resp.status}` };
  }
  return { ok: true, id: body?.id };
}

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.rpc("is_admin", { _user_id: ctx.userId });
  if (!data) throw new Error("Forbidden: admin only");
}

const TestInput = z.object({ to: z.string().email() });

export const sendTestEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => TestInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const res = await sendViaResend({
      to: data.to,
      subject: "Boostify — test email",
      html: `<p>This is a test email from your Boostify admin settings.</p>
             <p>If you got this, Resend is wired up correctly. ✅</p>`,
    });
    if (!res.ok) throw new Error(res.error);
    return { ok: true as const, id: res.id };
  });

const SaveInput = z.object({
  resend_api_key: z.string().nullable().optional(),
  email_from: z.string().email().nullable().optional(),
  email_from_name: z.string().nullable().optional(),
  admin_notification_email: z.string().email().nullable().optional(),
});

export const getEmailSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const s = await loadEmailSettings();
    // Mask the API key — only show whether one is set, last 4 chars for confirmation.
    return {
      email_from: s?.email_from ?? "",
      email_from_name: s?.email_from_name ?? "",
      admin_notification_email: s?.admin_notification_email ?? "",
      resend_api_key_set: Boolean(s?.resend_api_key),
      resend_api_key_last4: s?.resend_api_key ? s.resend_api_key.slice(-4) : "",
    };
  });

export const saveEmailSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => SaveInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/app-supabase/client.server");
    const patch: Record<string, unknown> = {
      email_from: data.email_from ?? null,
      email_from_name: data.email_from_name ?? null,
      admin_notification_email: data.admin_notification_email ?? null,
      updated_at: new Date().toISOString(),
    };
    // Only overwrite the key if the caller actually provided a new value.
    if (typeof data.resend_api_key === "string" && data.resend_api_key.length > 0) {
      patch.resend_api_key = data.resend_api_key;
    } else if (data.resend_api_key === null) {
      patch.resend_api_key = null;
    }
    const { error } = await supabaseAdmin
      .from("email_settings" as any)
      .update(patch)
      .eq("id", 1);
    if (error) throw error;
    return { ok: true as const };
  });
