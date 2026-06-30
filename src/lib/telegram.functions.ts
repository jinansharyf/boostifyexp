import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/app-supabase/auth-middleware";

type TgSettings = { bot_token: string | null; admin_chat_id: string | null; enabled: boolean };

export async function loadTelegramSettings(): Promise<TgSettings | null> {
  const { supabaseAdmin } = await import("@/integrations/app-supabase/client.server");
  const { data } = await (supabaseAdmin.from("telegram_settings" as any) as any)
    .select("bot_token, admin_chat_id, enabled")
    .eq("id", 1)
    .maybeSingle();
  return (data as TgSettings) ?? null;
}

export async function sendTelegram(text: string, chatId?: string): Promise<{ ok: boolean; error?: string }> {
  const s = await loadTelegramSettings();
  if (!s?.enabled || !s.bot_token) return { ok: false, error: "telegram disabled" };
  const chat = chatId ?? s.admin_chat_id;
  if (!chat) return { ok: false, error: "no chat id" };
  try {
    const resp = await fetch(`https://api.telegram.org/bot${s.bot_token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text, parse_mode: "HTML", disable_web_page_preview: true }),
    });
    if (!resp.ok) return { ok: false, error: `telegram ${resp.status}` };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "telegram error" };
  }
}

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.rpc("is_admin", { _user_id: ctx.userId });
  if (!data) throw new Error("Forbidden");
}

export const getTelegramSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const s = await loadTelegramSettings();
    return {
      enabled: !!s?.enabled,
      admin_chat_id: s?.admin_chat_id ?? "",
      bot_token_set: !!s?.bot_token,
      bot_token_last4: s?.bot_token ? s.bot_token.slice(-4) : "",
    };
  });

const SaveInput = z.object({
  enabled: z.boolean(),
  admin_chat_id: z.string().nullable().optional(),
  bot_token: z.string().nullable().optional(),
});

export const saveTelegramSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => SaveInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/app-supabase/client.server");
    const patch: Record<string, unknown> = {
      enabled: data.enabled,
      admin_chat_id: data.admin_chat_id ?? null,
      updated_at: new Date().toISOString(),
    };
    if (typeof data.bot_token === "string" && data.bot_token.length > 0) patch.bot_token = data.bot_token;
    else if (data.bot_token === null) patch.bot_token = null;
    const { error } = await supabaseAdmin.from("telegram_settings" as any).update(patch).eq("id", 1);
    if (error) throw error;
    return { ok: true as const };
  });

export const sendTelegramTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const res = await sendTelegram("✅ <b>Boostify test</b> — Telegram is wired up.");
    if (!res.ok) throw new Error(res.error ?? "Failed");
    return { ok: true as const };
  });