import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppTopBar, AppFooter, PublicShell, BoltMark } from "@/components/site/public-shell";
import { useSystemSettings } from "@/components/site/system-settings-provider";
import { useAuth } from "@/hooks/use-auth";
import {
  getLandingContent,
  listPublicVendors,
  DEFAULT_LANDING,
  type PublicVendor,
} from "@/lib/landing-content.functions";
import { computeHoursStatus, formatDuration } from "@/lib/opening-hours";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Boostify — Restaurant partner platform" },
      { name: "description", content: "Boostify helps restaurants grow with a managed delivery and order operations platform." },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  const { site_name } = useSystemSettings();
  const { user, isAdmin, isVendor } = useAuth();
  const name = site_name || "Boostify";
  const accountHref = isAdmin ? "/admin" : isVendor ? "/vendor" : "/auth";
  const getLanding = useServerFn(getLandingContent);
  const { data: lc = DEFAULT_LANDING } = useQuery({ queryKey: ["landing-content"], queryFn: () => getLanding() });
  const getVendors = useServerFn(listPublicVendors);
  const { data: vendors = [] } = useQuery({
    queryKey: ["public-vendors"],
    queryFn: () => getVendors() as Promise<PublicVendor[]>,
    enabled: lc.show_partners !== false,
  });
  const heroTitleParts = (lc.hero_title || `Run your kitchen.\n${name} runs the rest.`).split("\n");
  const heroSubtitle = lc.hero_subtitle || `A managed ordering, dispatch and operations layer for restaurants. Apply to partner with ${name} and our team will set up your vendor workspace.`;
  const ctaTitle = lc.cta_title || `Ready to grow with ${name}?`;

  return (
    <PublicShell>
      <AppTopBar />
      <main className="px-4 pt-2 md:px-10">
        {/* HERO — mobile-app style panel */}
        <section className="relative overflow-hidden rounded-[32px] border border-border bg-gradient-to-br from-ink via-forest to-ink p-6 text-mint-foreground shadow-[0_30px_80px_-50px_color-mix(in_oklab,var(--ink)_70%,transparent)] md:p-12">
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <div className="absolute -left-16 -top-24 h-80 w-80 rounded-full bg-mint/30 blur-3xl" />
            <div className="absolute -bottom-24 -right-10 h-72 w-72 rounded-full bg-primary/30 blur-3xl" />
            <svg className="absolute inset-0 h-full w-full opacity-[0.07]" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="hg" width="28" height="28" patternUnits="userSpaceOnUse">
                  <path d="M28 0H0V28" fill="none" stroke="currentColor" strokeWidth="1" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#hg)" />
            </svg>
          </div>

          <div className="relative flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-mint">
            <BoltMark className="h-5 w-5" />
            <span>{name} · partner network</span>
          </div>

          <h1 className="relative mt-4 font-display text-[2.4rem] font-extrabold leading-[1.02] tracking-tight md:text-6xl">
            {heroTitleParts.map((p, i) => (
              <span key={i}>
                {i === heroTitleParts.length - 1 ? <span className="italic text-mint">{p}</span> : p}
                {i < heroTitleParts.length - 1 && <br />}
              </span>
            ))}
          </h1>
          <p className="relative mt-4 max-w-xl text-sm leading-relaxed text-white/75 md:text-base">
            {heroSubtitle}
          </p>

          <div className="relative mt-6 flex flex-wrap gap-2.5">
            <Link
              to="/vendor/register"
              className="inline-flex items-center gap-2 rounded-full bg-mint px-5 py-3 text-sm font-semibold text-mint-foreground shadow-[0_12px_30px_-12px_color-mix(in_oklab,var(--mint)_80%,transparent)] transition active:scale-95"
            >
              {lc.hero_cta_label || "Apply as a restaurant"}
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 5l7 7-7 7" /></svg>
            </Link>
            {user ? (
              <Link to={accountHref} className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition active:scale-95">
                Go to dashboard
              </Link>
            ) : (
              <Link to="/auth" className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition active:scale-95">
                Partner sign in
              </Link>
            )}
          </div>

          {/* Floating stats chips — mobile-app dashboard vibe */}
          <div className="relative mt-7 grid grid-cols-3 gap-2 md:mt-10 md:max-w-lg md:gap-3">
            {lc.stats.map((s) => (
              <div key={s.v} className="rounded-2xl border border-white/10 bg-white/5 p-3 backdrop-blur-md md:p-4">
                <div className="font-display text-lg font-extrabold leading-none md:text-2xl">{s.k}</div>
                <div className="mt-1 text-[10px] uppercase tracking-wider text-white/70 md:text-xs">{s.v}</div>
              </div>
            ))}
          </div>
        </section>

        {/* QUICK ACTIONS — App-style action rail */}
        <section className="mt-5 grid grid-cols-3 gap-2 md:hidden">
          <QuickAction to="/vendor/register" label="Apply" icon={
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>
          } />
          <QuickAction to="/track" label="Track" icon={
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
          } />
          <QuickAction to={user ? accountHref : "/auth"} label={user ? "Account" : "Sign in"} icon={
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 5-6 8-6s6.5 2 8 6"/></svg>
          } />
        </section>

        {/* SHOWCASE / FEATURES */}
        <section className="mt-8">
          <SectionHeading title={lc.showcase_title || "Everything your kitchen needs"} subtitle={lc.showcase_subtitle} />
          <div className="mt-4 grid gap-3 md:grid-cols-3 md:gap-5">
            {lc.features.map((f, i) => (
              <div key={f.t} className="group relative overflow-hidden rounded-2xl border border-border bg-card p-5 transition hover:-translate-y-0.5 hover:shadow-lg">
                <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-primary/10 blur-2xl transition group-hover:bg-primary/20" />
                <div className="relative grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-mint to-primary text-mint-foreground shadow-[0_10px_25px_-12px_color-mix(in_oklab,var(--forest)_50%,transparent)]">
                  <span className="font-display text-sm font-black">0{i + 1}</span>
                </div>
                <h3 className="relative mt-3 font-display text-lg font-bold text-foreground">{f.t}</h3>
                <p className="relative mt-1 text-sm text-muted-foreground">{f.d}</p>
              </div>
            ))}
          </div>
        </section>

        {/* PARTNERS */}
        {lc.show_partners !== false && vendors.length > 0 && (
          <section className="mt-8">
            <div className="flex items-end justify-between gap-3">
              <SectionHeading title={lc.partners_title || "Our partners"} subtitle={lc.partners_subtitle} />
              <span className="hidden shrink-0 rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-muted-foreground md:inline-flex">
                {vendors.length} live
              </span>
            </div>

            {/* mobile: horizontal snap scroller */}
            <div className="mt-4 -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 md:hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {vendors.map((v) => (
                <PartnerCard key={v.id} v={v} className="w-[70vw] max-w-[280px] shrink-0 snap-start" />
              ))}
            </div>

            {/* desktop: grid */}
            <div className="mt-6 hidden gap-5 md:grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {vendors.map((v) => (
                <PartnerCard key={v.id} v={v} />
              ))}
            </div>
          </section>
        )}

        {/* HOW IT WORKS — timeline */}
        <section className="mt-8 rounded-[28px] border border-border bg-card p-6 md:p-10">
          <SectionHeading title="How partnering works" />
          <ol className="relative mt-5 grid gap-4 md:grid-cols-3">
            <span aria-hidden className="pointer-events-none absolute left-8 top-8 hidden h-[2px] w-[calc(100%-4rem)] bg-gradient-to-r from-primary/40 via-primary/40 to-transparent md:block" />
            {lc.steps.map((s) => (
              <li key={s.n} className="relative rounded-2xl border border-border bg-background p-5">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-primary text-primary-foreground font-display text-sm font-black">{s.n}</span>
                  <span className="font-display text-lg font-bold text-foreground">{s.t}</span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{s.d}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* CTA */}
        <section className="mt-8 overflow-hidden rounded-[28px] border border-border bg-foreground p-6 text-background md:p-10">
          <div className="flex flex-wrap items-center justify-between gap-5">
            <div>
              <h2 className="font-display text-2xl font-extrabold md:text-3xl">{ctaTitle}</h2>
              <p className="mt-2 text-sm text-background/70 md:text-base">{lc.cta_subtitle}</p>
            </div>
            <Link
              to="/vendor/register"
              className="inline-flex items-center gap-2 rounded-full bg-mint px-6 py-3 text-sm font-semibold text-mint-foreground transition active:scale-95"
            >
              {lc.cta_label || "Start application"}
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 5l7 7-7 7" /></svg>
            </Link>
          </div>
          {lc.footer_tagline && (
            <p className="mt-4 text-xs uppercase tracking-[0.18em] text-background/50">{lc.footer_tagline}</p>
          )}
        </section>

        <AppFooter />
      </main>
    </PublicShell>
  );
}

function SectionHeading({ title, subtitle }: { title: string; subtitle?: string | null }) {
  return (
    <div className="max-w-2xl">
      <h2 className="font-display text-2xl font-extrabold tracking-tight text-foreground md:text-3xl">{title}</h2>
      {subtitle && <p className="mt-1.5 text-sm text-muted-foreground md:text-base">{subtitle}</p>}
    </div>
  );
}

function QuickAction({ to, label, icon }: { to: "/vendor/register" | "/track" | "/auth" | "/admin" | "/vendor"; label: string; icon: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="flex flex-col items-center gap-1.5 rounded-2xl border border-border bg-card px-3 py-3 text-xs font-semibold text-foreground transition active:scale-95"
    >
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary">{icon}</span>
      {label}
    </Link>
  );
}

function PartnerCard({ v, className = "" }: { v: PublicVendor; className?: string }) {
  const initial = (v.store_name || "?").trim().charAt(0).toUpperCase();
  const mapHref = v.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(v.address)}` : null;
  const status = useMemo(() => computeHoursStatus(v.opening_hours as any), [v.opening_hours]);
  const manuallyClosed = v.is_open === false;
  const badge = (() => {
    if (manuallyClosed) return { text: "Closed", tone: "muted" as const };
    if (status.state === "open") return { text: `Open • closes in ${formatDuration(status.closesInMin)}`, tone: "open" as const };
    if (status.state === "closed") {
      if (status.opensInMin == null) return { text: "Closed", tone: "muted" as const };
      return { text: `Opens in ${formatDuration(status.opensInMin)}`, tone: "closed" as const };
    }
    // No hours set → fall back to is_open flag.
    return v.is_open ? { text: "Open now", tone: "open" as const } : { text: "Closed", tone: "muted" as const };
  })();
  const dot = badge.tone === "open" ? "bg-emerald-500" : badge.tone === "closed" ? "bg-amber-500" : "bg-muted-foreground/60";
  return (
    <div className={`group relative overflow-hidden rounded-3xl border border-border bg-card shadow-sm transition hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl ${className}`}>
      <div className="relative h-28 w-full overflow-hidden bg-gradient-to-br from-mint/30 via-primary/25 to-forest/25 md:h-32">
        {v.cover_url ? (
          <img src={v.cover_url} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <svg className="absolute inset-0 h-full w-full opacity-30" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id={`pc-${v.id}`} width="18" height="18" patternUnits="userSpaceOnUse">
                <path d="M18 0H0V18" fill="none" stroke="currentColor" strokeWidth="0.8" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill={`url(#pc-${v.id})`} />
          </svg>
        )}
        <span className="absolute right-2.5 top-2.5 inline-flex items-center gap-1.5 rounded-full bg-background/95 px-2.5 py-1 text-[10px] font-semibold text-foreground shadow-sm">
          <span className={`h-1.5 w-1.5 rounded-full ${dot}`} /> {badge.text}
        </span>
      </div>
      <div className="flex items-start gap-3 p-4 pt-3 md:p-5 md:pt-3.5">
        <div className="-mt-10 relative z-10 grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl border-[3px] border-card bg-card shadow-md">
          {v.logo_url ? (
            <img src={v.logo_url} alt={v.store_name} className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <span className="font-display text-xl font-black text-primary">{initial}</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-base font-bold text-foreground">{v.store_name}</div>
          {v.cuisine && (
            <div className="truncate text-[11px] font-semibold uppercase tracking-wider text-primary">{v.cuisine}</div>
          )}
          {mapHref ? (
            <a href={mapHref} target="_blank" rel="noreferrer" className="mt-1.5 flex items-start gap-1 text-xs text-muted-foreground hover:text-primary">
              <svg viewBox="0 0 24 24" className="mt-[2px] h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s-7-6.2-7-12a7 7 0 1 1 14 0c0 5.8-7 12-7 12Z" />
                <circle cx="12" cy="10" r="2.5" />
              </svg>
              <span className="line-clamp-2">{v.address}</span>
            </a>
          ) : (
            <div className="mt-1.5 text-xs text-muted-foreground">Location coming soon</div>
          )}
        </div>
      </div>
    </div>
  );
}
