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
  const { data, error } = await supabaseAdmin
    .from("email_settings" as any)
    .select("resend_api_key, email_from, email_from_name, admin_notification_email")
    .eq("id", 1)
    .maybeSingle();
  if (error) return null;
  return (data as EmailSettings) ?? null;
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
