import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/app-supabase/auth-middleware";

export type SmsSettings = {
  sms_enabled: boolean;
  sms_api_key: string | null;
  sms_api_url: string | null;
  sms_sender_id: string | null;
};

const DEFAULT_OWL_URL = "https://api.owl.mv/v1/sms/send";

export async function loadSmsSettings(): Promise<SmsSettings | null> {
  const { supabaseAdmin } = await import("@/integrations/app-supabase/client.server");
  const { data } = await (supabaseAdmin.from("app_settings" as any) as any)
    .select("sms_enabled, sms_api_key, sms_api_url, sms_sender_id")
    .eq("id", 1)
    .maybeSingle();
  return (data as SmsSettings) ?? null;
}

function normalizePhone(p: string): string {
  const raw = (p ?? "").trim().replace(/[^\d+]/g, "");
  return raw;
}

/** Send a single SMS via Owl (or any provider using an equivalent JSON API). */
export async function sendSms(to: string, message: string): Promise<{ ok: boolean; error?: string }> {
  const s = await loadSmsSettings();
  if (!s?.sms_enabled) return { ok: false, error: "sms disabled" };
  if (!s.sms_api_key) return { ok: false, error: "no sms api key" };
  const number = normalizePhone(to);
  if (!number) return { ok: false, error: "no recipient" };
  const url = (s.sms_api_url && s.sms_api_url.trim()) || DEFAULT_OWL_URL;
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${s.sms_api_key}`,
      },
      body: JSON.stringify({
        to: number,
        recipient: number,
        from: s.sms_sender_id ?? undefined,
        sender: s.sms_sender_id ?? undefined,
        sender_id: s.sms_sender_id ?? undefined,
        message,
        text: message,
      }),
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      return { ok: false, error: `sms ${resp.status} ${body.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "sms error" };
  }
}

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.rpc("is_admin", { _user_id: ctx.userId });
  if (!data) throw new Error("Forbidden");
}

export const getSmsSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const s = await loadSmsSettings();
    const { supabaseAdmin } = await import("@/integrations/app-supabase/client.server");
    const { data: tpl } = await (supabaseAdmin.from("app_settings" as any) as any)
      .select("sms_tpl_picked, sms_tpl_on_the_way, sms_tpl_delivered")
      .eq("id", 1)
      .maybeSingle();
    return {
      sms_enabled: !!s?.sms_enabled,
      sms_api_url: s?.sms_api_url ?? "",
      sms_sender_id: s?.sms_sender_id ?? "",
      sms_api_key_set: !!s?.sms_api_key,
      sms_api_key_last4: s?.sms_api_key ? s.sms_api_key.slice(-4) : "",
      sms_tpl_picked: (tpl as any)?.sms_tpl_picked ?? "",
      sms_tpl_on_the_way: (tpl as any)?.sms_tpl_on_the_way ?? "",
      sms_tpl_delivered: (tpl as any)?.sms_tpl_delivered ?? "",
    };
  });

const SaveSchema = z.object({
  sms_enabled: z.boolean(),
  sms_api_url: z.string().max(500).optional().nullable(),
  sms_sender_id: z.string().max(50).optional().nullable(),
  sms_api_key: z.string().max(500).optional().nullable(),
  sms_tpl_picked: z.string().max(500).optional().nullable(),
  sms_tpl_on_the_way: z.string().max(500).optional().nullable(),
  sms_tpl_delivered: z.string().max(500).optional().nullable(),
});

export const saveSmsSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => SaveSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/app-supabase/client.server");
    const payload: any = {
      sms_enabled: data.sms_enabled,
      sms_api_url: data.sms_api_url ?? null,
      sms_sender_id: data.sms_sender_id ?? null,
    };
    if (typeof data.sms_tpl_picked === "string") payload.sms_tpl_picked = data.sms_tpl_picked;
    if (typeof data.sms_tpl_on_the_way === "string") payload.sms_tpl_on_the_way = data.sms_tpl_on_the_way;
    if (typeof data.sms_tpl_delivered === "string") payload.sms_tpl_delivered = data.sms_tpl_delivered;
    // Only overwrite the API key when a new non-empty value was provided.
    if (typeof data.sms_api_key === "string" && data.sms_api_key.trim().length > 0) {
      payload.sms_api_key = data.sms_api_key.trim();
    }
    const { error } = await (supabaseAdmin.from("app_settings" as any) as any)
      .update(payload)
      .eq("id", 1);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const sendTestSms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ to: z.string().min(3).max(40) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    return await sendSms(data.to, "Test SMS from your delivery system. If you received this, SMS is working ✅");
  });

/** Public site origin used in customer-facing links. Reads app_settings.public_url. */
export async function getPublicOrigin(): Promise<string> {
  try {
    const { supabaseAdmin } = await import("@/integrations/app-supabase/client.server");
    const { data } = await (supabaseAdmin.from("app_settings" as any) as any)
      .select("public_url")
      .eq("id", 1)
      .maybeSingle();
    const raw = (data as any)?.public_url as string | undefined;
    if (raw && raw.trim()) return raw.trim().replace(/\/$/, "");
  } catch {}
  const env = process.env.APP_PUBLIC_URL;
  if (env && env.trim()) return env.trim().replace(/\/$/, "");
  return "https://boostifyexp.vercel.app";
}

/** Public contact phone shown on the customer tracking page. */
export async function getPublicContactPhone(): Promise<string | null> {
  try {
    const { supabaseAdmin } = await import("@/integrations/app-supabase/client.server");
    const { data } = await (supabaseAdmin.from("app_settings" as any) as any)
      .select("contact_phone")
      .eq("id", 1)
      .maybeSingle();
    return ((data as any)?.contact_phone as string | null) ?? null;
  } catch {
    return null;
  }
}