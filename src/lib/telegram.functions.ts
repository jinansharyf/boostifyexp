import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/app-supabase/auth-middleware";

type TgSettings = { bot_token: string | null; admin_chat_id: string | null; enabled: boolean; broadcast_chat_ids?: string | null };

export async function loadTelegramSettings(): Promise<TgSettings | null> {
  const { supabaseAdmin } = await import("@/integrations/app-supabase/client.server");
  const { data } = await (supabaseAdmin.from("telegram_settings" as any) as any)
    .select("bot_token, admin_chat_id, enabled, broadcast_chat_ids")
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

/**
 * Broadcast a message to the admin chat + every additional chat/group ID
 * configured in telegram_settings.broadcast_chat_ids (comma/space/newline separated).
 */
export async function sendTelegramBroadcast(text: string): Promise<{ sent: number; failed: number }> {
  const s = await loadTelegramSettings();
  if (!s?.enabled || !s.bot_token) return { sent: 0, failed: 0 };
  const ids = new Set<string>();
  if (s.admin_chat_id) ids.add(s.admin_chat_id.trim());
  if (s.broadcast_chat_ids) {
    for (const id of s.broadcast_chat_ids.split(/[\s,]+/)) {
      const v = id.trim();
      if (v) ids.add(v);
    }
  }
  let sent = 0, failed = 0;
  await Promise.allSettled(
    Array.from(ids).map(async (chat) => {
      try {
        const resp = await fetch(`https://api.telegram.org/bot${s.bot_token}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chat, text, parse_mode: "HTML", disable_web_page_preview: true }),
        });
        if (resp.ok) sent++; else failed++;
      } catch { failed++; }
    }),
  );
  return { sent, failed };
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
      broadcast_chat_ids: s?.broadcast_chat_ids ?? "",
      bot_token_set: !!s?.bot_token,
      bot_token_last4: s?.bot_token ? s.bot_token.slice(-4) : "",
    };
  });

const SaveInput = z.object({
  enabled: z.boolean(),
  admin_chat_id: z.string().nullable().optional(),
  broadcast_chat_ids: z.string().nullable().optional(),
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
      broadcast_chat_ids: data.broadcast_chat_ids ?? null,
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
    const res = await sendTelegramBroadcast("✅ <b>Boostify test</b> — Telegram is wired up.");
    if (res.sent === 0) throw new Error("No chats reached. Check bot token and chat IDs (bot must be added to each group).");
    return { ok: true as const, sent: res.sent, failed: res.failed };
  });