import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/app-supabase/auth-middleware";

export type LandingContent = {
  hero_title: string | null;
  hero_subtitle: string | null;
  hero_cta_label: string | null;
  stats: { k: string; v: string }[];
  features: { t: string; d: string }[];
  steps: { n: string; t: string; d: string }[];
  cta_title: string | null;
  cta_subtitle: string | null;
  cta_label: string | null;
};

export const DEFAULT_LANDING: LandingContent = {
  hero_title: null,
  hero_subtitle: null,
  hero_cta_label: "Apply as a restaurant",
  stats: [
    { k: "6-step", v: "Live order tracking" },
    { k: "24/7", v: "Partner support" },
    { k: "0%", v: "Setup fees" },
  ],
  features: [
    { t: "Vendor workspace", d: "Manage menu, hours, prep times and live orders from one dashboard." },
    { t: "Smart dispatch", d: "Orders routed across our 6-stage delivery flow from placed to delivered." },
    { t: "Admin support", d: "Direct chat with the Boostify ops team for anything urgent." },
  ],
  steps: [
    { n: "01", t: "Apply", d: "Submit your restaurant details in under 3 minutes." },
    { n: "02", t: "Review", d: "Our admin team reviews and reaches out to confirm." },
    { n: "03", t: "Go live", d: "Receive credentials and start taking orders." },
  ],
  cta_title: null,
  cta_subtitle: "Apply now and our team will get back within 24 hours.",
  cta_label: "Start application",
};

function normalize(row: any): LandingContent {
  if (!row) return DEFAULT_LANDING;
  return {
    hero_title: row.hero_title ?? null,
    hero_subtitle: row.hero_subtitle ?? null,
    hero_cta_label: row.hero_cta_label ?? DEFAULT_LANDING.hero_cta_label,
    stats: Array.isArray(row.stats) && row.stats.length ? row.stats : DEFAULT_LANDING.stats,
    features: Array.isArray(row.features) && row.features.length ? row.features : DEFAULT_LANDING.features,
    steps: Array.isArray(row.steps) && row.steps.length ? row.steps : DEFAULT_LANDING.steps,
    cta_title: row.cta_title ?? null,
    cta_subtitle: row.cta_subtitle ?? DEFAULT_LANDING.cta_subtitle,
    cta_label: row.cta_label ?? DEFAULT_LANDING.cta_label,
  };
}

export const getLandingContent = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/app-supabase/client.server");
  const { data } = await (supabaseAdmin.from("landing_content" as any) as any)
    .select("*").eq("id", 1).maybeSingle();
  return normalize(data);
});

const Item = z.object({ k: z.string(), v: z.string() });
const Feat = z.object({ t: z.string(), d: z.string() });
const Step = z.object({ n: z.string(), t: z.string(), d: z.string() });
const SaveInput = z.object({
  hero_title: z.string().nullable().optional(),
  hero_subtitle: z.string().nullable().optional(),
  hero_cta_label: z.string().nullable().optional(),
  stats: z.array(Item).optional(),
  features: z.array(Feat).optional(),
  steps: z.array(Step).optional(),
  cta_title: z.string().nullable().optional(),
  cta_subtitle: z.string().nullable().optional(),
  cta_label: z.string().nullable().optional(),
});

export const saveLandingContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => SaveInput.parse(i))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
    if (!isAdmin) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/app-supabase/client.server");
    const { error } = await supabaseAdmin
      .from("landing_content" as any)
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq("id", 1);
    if (error) throw error;
    return { ok: true as const };
  });