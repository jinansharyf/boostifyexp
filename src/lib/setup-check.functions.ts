import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/app-supabase/auth-middleware";

export type CheckResult = {
  key: string;
  label: string;
  table: string;
  columns?: string[];
  ok: boolean;
  missing: string[];
  error?: string;
};

const CHECKS: { key: string; label: string; table: string; columns?: string[] }[] = [
  { key: "0002", label: "Partner applications", table: "partner_applications", columns: ["id", "applicant_email", "status"] },
  { key: "0005", label: "Chat search / images", table: "chat_messages", columns: ["id", "body"] },
  { key: "0006", label: "Password reset rate limit", table: "password_reset_requests", columns: ["email", "last_sent_at"] },
  { key: "0007a", label: "Vehicle types", table: "vehicle_types", columns: ["id", "code", "is_active"] },
  { key: "0007b", label: "Delivery prices matrix", table: "delivery_prices", columns: ["zone_id", "vehicle_type_id", "price_per_delivery"] },
  { key: "0007c", label: "Partner billing entries", table: "partner_billing_entries", columns: ["order_id", "partner_id", "amount", "status"] },
  { key: "0007d", label: "Partner payments", table: "partner_payments", columns: ["partner_id", "amount"] },
  { key: "0007e", label: "Orders pricing columns", table: "orders", columns: ["pickup_zone_id", "vehicle_type_id", "customer_name"] },
  { key: "0008a", label: "Landing content", table: "landing_content", columns: ["hero_title", "stats", "features"] },
  { key: "0008b", label: "Telegram settings", table: "telegram_settings", columns: ["bot_token", "admin_chat_id"] },
  { key: "0008c", label: "Web push subscriptions", table: "push_subscriptions", columns: ["endpoint", "user_id"] },
  { key: "0009", label: "Billing cycle", table: "vendors", columns: ["billing_cycle"] },
  { key: "0010", label: "Order form fields", table: "order_form_fields", columns: ["field_key", "field_type", "section"] },
  { key: "0011a", label: "Staff members", table: "staff_members", columns: ["user_id", "staff_role"] },
  { key: "0011b", label: "Staff zones", table: "staff_zones", columns: ["user_id", "zone_id"] },
  { key: "0012", label: "Staff notifications", table: "staff_members", columns: ["telegram_chat_id"] },
  { key: "0013", label: "Vendor location", table: "vendors", columns: ["latitude", "longitude"] },
  { key: "0014", label: "Landing extras", table: "landing_content", columns: ["showcase_title", "partners_title", "show_partners", "footer_tagline"] },
  { key: "0015", label: "Theme colors", table: "app_settings", columns: ["background_color", "foreground_color", "card_color", "theme_mode"] },
];

export const runSetupChecks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: roles } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const list = (roles ?? []).map((r: any) => r.role);
    if (!list.includes("admin") && !list.includes("super_admin")) {
      throw new Error("Forbidden");
    }
    const { supabaseAdmin } = await import("@/integrations/app-supabase/client.server");
    const results: CheckResult[] = [];
    for (const c of CHECKS) {
      const cols = c.columns?.join(", ") ?? "*";
      const { error } = await (supabaseAdmin as any)
        .from(c.table)
        .select(cols, { head: true, count: "exact" })
        .limit(0);
      if (!error) {
        results.push({ ...c, ok: true, missing: [] });
        continue;
      }
      const msg = String(error.message || error);
      // Table missing
      if (/does not exist|schema cache|not find the table/i.test(msg) && !/column/i.test(msg)) {
        results.push({ ...c, ok: false, missing: [c.table], error: msg });
        continue;
      }
      // Column missing — probe each column individually
      const missing: string[] = [];
      for (const col of c.columns ?? []) {
        const r = await (supabaseAdmin as any)
          .from(c.table)
          .select(col, { head: true, count: "exact" })
          .limit(0);
        if (r.error) missing.push(col);
      }
      results.push({ ...c, ok: missing.length === 0, missing, error: msg });
    }
    return results;
  });
