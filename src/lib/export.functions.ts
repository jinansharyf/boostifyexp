import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/app-supabase/auth-middleware";

// Curated list of "configuration" tables safe to snapshot for portability.
// User/PII tables (profiles, orders, chat_messages, notifications) are excluded.
const CONFIG_TABLES = [
  "app_settings",
  "email_settings",
  "telegram_settings",
  "zones",
  "vehicle_types",
  "zone_prices",
  "order_form_fields",
  "order_number_counters",
  "landing_features",
  "landing_stats",
  "landing_sections",
  "bank_accounts",
] as const;

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data: roles } = await ctx.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", ctx.userId);
  const list = (roles ?? []).map((r: any) => r.role as string);
  if (!list.includes("admin") && !list.includes("super_admin")) {
    throw new Error("Forbidden");
  }
}

export const exportConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/app-supabase/client.server");

    const tables: Record<string, any[] | { error: string }> = {};
    for (const name of CONFIG_TABLES) {
      const { data, error } = await (supabaseAdmin.from(name as any) as any).select("*");
      if (error) {
        tables[name] = { error: error.message };
        continue;
      }
      tables[name] = data ?? [];
    }

    return {
      generated_at: new Date().toISOString(),
      note:
        "Configuration snapshot. Does not include auth users, orders, chats, or secrets. Secrets (Resend, Telegram bot token, Owl SMS key, Supabase keys) live in environment variables and must be re-created in the destination project.",
      tables,
    };
  });
