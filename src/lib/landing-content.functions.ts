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
  showcase_title: string | null;
  showcase_subtitle: string | null;
  partners_title: string | null;
  partners_subtitle: string | null;
  show_partners: boolean;
  footer_tagline: string | null;
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
  showcase_title: "Built for busy kitchens",
  showcase_subtitle: "A pocket-sized ops console for you and every partner on the network.",
  partners_title: "Our partners",
  partners_subtitle: "Stores already delivering with us — tap any to see them on the map.",
  show_partners: true,
  footer_tagline: "One tap to apply. Zero setup fees.",
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
    showcase_title: row.showcase_title ?? DEFAULT_LANDING.showcase_title,
    showcase_subtitle: row.showcase_subtitle ?? DEFAULT_LANDING.showcase_subtitle,
    partners_title: row.partners_title ?? DEFAULT_LANDING.partners_title,
    partners_subtitle: row.partners_subtitle ?? DEFAULT_LANDING.partners_subtitle,
    show_partners: row.show_partners ?? DEFAULT_LANDING.show_partners,
    footer_tagline: row.footer_tagline ?? DEFAULT_LANDING.footer_tagline,
  };
}

export const getLandingContent = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/app-supabase/client.server");
  const { data } = await (supabaseAdmin.from("landing_content" as any) as any)
    .select("*").eq("id", 1).maybeSingle();
  return normalize(data);
});

export type PublicVendor = {
  id: string;
  store_name: string;
  slug: string | null;
  logo_url: string | null;
  cover_url: string | null;
  cuisine: string | null;
  address: string | null;
  is_open: boolean | null;
  rating: number | null;
};

export const listPublicVendors = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/app-supabase/client.server");
  const { data } = await (supabaseAdmin.from("vendors") as any)
    .select("id, store_name, slug, logo_url, cover_url, cuisine, address, is_open, rating")
    .eq("status", "approved")
    .order("rating", { ascending: false, nullsFirst: false })
    .order("store_name", { ascending: true })
    .limit(24);
  return (data ?? []) as PublicVendor[];
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
  showcase_title: z.string().nullable().optional(),
  showcase_subtitle: z.string().nullable().optional(),
  partners_title: z.string().nullable().optional(),
  partners_subtitle: z.string().nullable().optional(),
  show_partners: z.boolean().optional(),
  footer_tagline: z.string().nullable().optional(),
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