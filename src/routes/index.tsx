import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppTopBar, AppFooter, PublicShell } from "@/components/site/public-shell";
import { useSystemSettings } from "@/components/site/system-settings-provider";
import { useAuth } from "@/hooks/use-auth";
import { getLandingContent, DEFAULT_LANDING } from "@/lib/landing-content.functions";

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
  const heroTitleParts = (lc.hero_title || `Run your kitchen.\n${name} runs the rest.`).split("\n");
  const heroSubtitle = lc.hero_subtitle || `A managed ordering, dispatch and operations layer for restaurants. Apply to partner with ${name} and our team will set up your vendor workspace.`;
  const ctaTitle = lc.cta_title || `Ready to grow with ${name}?`;

  return (
    <PublicShell>
      <AppTopBar />
      <main className="px-5 pt-4 md:px-10">
        {/* Hero */}
        <section className="relative overflow-hidden rounded-[32px] border border-border bg-gradient-to-br from-primary/10 via-card to-mint/10 p-6 md:p-12">
          <div className="max-w-2xl">
            <h1 className="font-display text-4xl font-extrabold leading-[1.05] tracking-tight text-foreground md:text-6xl">
              {heroTitleParts.map((p, i) => (
                <span key={i}>
                  {i === heroTitleParts.length - 1 ? <span className="italic text-primary">{p}</span> : p}
                  {i < heroTitleParts.length - 1 && <br />}
                </span>
              ))}
            </h1>
            <p className="mt-5 max-w-xl text-base text-muted-foreground md:text-lg">
              {heroSubtitle}
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                to="/vendor/register"
                className="inline-flex items-center gap-2 rounded-full bg-foreground px-6 py-3 text-sm font-semibold text-background transition active:scale-95"
              >
                {lc.hero_cta_label || "Apply as a restaurant"}
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 5l7 7-7 7" /></svg>
              </Link>
              {user ? (
                <Link to={accountHref} className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-6 py-3 text-sm font-semibold text-foreground transition active:scale-95">
                  Go to dashboard
                </Link>
              ) : (
                <Link to="/auth" className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-6 py-3 text-sm font-semibold text-foreground transition active:scale-95">
                  Partner sign in
                </Link>
              )}
            </div>
          </div>
          <div className="pointer-events-none absolute -right-10 -top-10 hidden h-72 w-72 rounded-full bg-primary/20 blur-3xl md:block" />
          <div className="pointer-events-none absolute -bottom-16 right-10 hidden h-60 w-60 rounded-full bg-mint/30 blur-3xl md:block" />
        </section>

        {/* Stats */}
        <section className="mt-6 grid grid-cols-3 gap-3 md:gap-5">
          {lc.stats.map((s) => (
            <div key={s.v} className="rounded-2xl border border-border bg-card p-4 md:p-6">
              <div className="font-display text-2xl font-extrabold text-foreground md:text-4xl">{s.k}</div>
              <div className="mt-1 text-xs text-muted-foreground md:text-sm">{s.v}</div>
            </div>
          ))}
        </section>

        {/* What you get */}
        <section className="mt-8">
          <h2 className="font-display text-2xl font-extrabold tracking-tight text-foreground md:text-3xl">Everything your kitchen needs</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-3 md:gap-5">
            {lc.features.map((f) => (
              <div key={f.t} className="rounded-2xl border border-border bg-card p-5">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7" /></svg>
                </div>
                <h3 className="mt-3 font-display text-lg font-bold text-foreground">{f.t}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{f.d}</p>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="mt-8 rounded-[28px] border border-border bg-card p-6 md:p-10">
          <h2 className="font-display text-2xl font-extrabold tracking-tight text-foreground md:text-3xl">How partnering works</h2>
          <ol className="mt-5 grid gap-4 md:grid-cols-3">
            {lc.steps.map((s) => (
              <li key={s.n} className="rounded-2xl border border-border bg-background p-5">
                <div className="font-display text-3xl font-extrabold text-primary">{s.n}</div>
                <div className="mt-2 font-display text-lg font-bold text-foreground">{s.t}</div>
                <p className="mt-1 text-sm text-muted-foreground">{s.d}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* CTA */}
        <section className="mt-8 rounded-[28px] border border-border bg-foreground p-6 text-background md:p-10">
          <div className="flex flex-wrap items-center justify-between gap-5">
            <div>
              <h2 className="font-display text-2xl font-extrabold md:text-3xl">{ctaTitle}</h2>
              <p className="mt-2 text-sm text-background/70 md:text-base">{lc.cta_subtitle}</p>
            </div>
            <Link
              to="/vendor/register"
              className="inline-flex items-center gap-2 rounded-full bg-mint px-6 py-3 text-sm font-semibold text-foreground transition active:scale-95"
            >
              {lc.cta_label || "Start application"}
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 5l7 7-7 7" /></svg>
            </Link>
          </div>
        </section>

        <AppFooter />
      </main>
    </PublicShell>
  );
}
