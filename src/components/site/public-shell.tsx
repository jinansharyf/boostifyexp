import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import boostifyLogo from "@/assets/boostify-logo.png.asset.json";
import { useSystemSettings } from "@/components/site/system-settings-provider";
import { useAuth } from "@/hooks/use-auth";

/**
 * Inline bolt mark — sits inside a rounded badge with a mint→forest gradient.
 * Used as the system fallback logo (when no custom logo_url is set in settings)
 * and as a small brand chip throughout the app.
 */
export function BoltMark({ className = "" }: { className?: string }) {
  return (
    <span
      className={`relative inline-grid place-items-center overflow-hidden rounded-[28%] bg-gradient-to-br from-mint via-primary to-forest text-mint-foreground shadow-[0_8px_20px_-10px_color-mix(in_oklab,var(--forest)_60%,transparent)] ${className}`}
    >
      <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_80%_at_20%_10%,color-mix(in_oklab,white_45%,transparent),transparent_60%)]" />
      <svg viewBox="0 0 24 24" className="relative h-[62%] w-[62%] drop-shadow-[0_1px_0_color-mix(in_oklab,black_25%,transparent)]" fill="currentColor" aria-hidden>
        <path d="M13.2 2 4 13.6h6.1L9 22l10.4-12.4h-6.4L13.2 2Z" />
      </svg>
    </span>
  );
}

export function BoltLogo({ className = "" }: { className?: string }) {
  const { logo_url, site_name } = useSystemSettings();
  const isDefault = !logo_url || logo_url === boostifyLogo.url;
  if (isDefault) return <BoltMark className={className} />;
  return <img src={logo_url} alt={site_name} className={className} />;
}

export function Wordmark() {
  const { logo_url, site_name } = useSystemSettings();
  const name = site_name || "Boostify";
  const head = name.length > 4 ? name.slice(0, name.length - 3) : name;
  const tail = name.length > 4 ? name.slice(name.length - 3) : "";
  const isDefault = !logo_url || logo_url === boostifyLogo.url;
  return (
    <Link to="/" className="group flex min-w-0 items-center gap-2.5 font-display text-xl font-extrabold tracking-tight text-foreground">
      {isDefault ? (
        <BoltMark className="h-9 w-9 shrink-0 transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-105" />
      ) : (
        <img src={logo_url} alt={name} className="h-9 w-9 shrink-0 rounded-[28%] object-contain" />
      )}
      <span className="truncate whitespace-nowrap leading-none">
        {head}
        {tail && <span className="italic text-primary">{tail}</span>}
      </span>
    </Link>
  );
}

export function PublicShell({ children, hideBottomNav = false }: { children: ReactNode; hideBottomNav?: boolean }) {
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-background">
      {/* Ambient brand aura — sits behind everything */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-[520px] overflow-hidden">
        <div className="absolute -left-32 -top-40 h-[420px] w-[420px] rounded-full bg-mint/40 blur-3xl" />
        <div className="absolute -right-24 top-10 h-[360px] w-[360px] rounded-full bg-primary/25 blur-3xl" />
        <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-background/70 to-transparent" />
      </div>
      <div className="relative z-10 mx-auto w-full max-w-[1240px]">
        <div className={hideBottomNav ? "" : "pb-28 md:pb-12"}>{children}</div>
        {!hideBottomNav && <BottomNav />}
      </div>
    </div>
  );
}

const TOP_LINKS: { to: NavItem["to"]; label: string }[] = [
  { to: "/track", label: "Track order" },
  { to: "/vendor/register", label: "Apply as partner" },
];

export function AppTopBar({ right }: { right?: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user, isAdmin, isVendor } = useAuth();
  const accountHref = isAdmin ? "/admin" : isVendor ? "/vendor" : "/auth";
  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 px-4 py-3 backdrop-blur-xl md:px-8 md:py-4">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
        <Wordmark />
        <nav className="hidden items-center gap-1 md:flex">
          {TOP_LINKS.map((l) => {
            const active = l.to === "/" ? pathname === "/" : pathname.startsWith(l.to);
            return (
              <Link
                key={l.to}
                to={l.to}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  active ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-2">
          {right ?? (user ? (
            <Link
              to={accountHref}
              className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-95 active:scale-95"
            >
              Account
            </Link>
          ) : (
            <>
              <Link
                to="/vendor/register"
                className="hidden rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground transition hover:border-primary/40 active:scale-95 md:inline-flex"
              >
                Apply
              </Link>
              <Link
                to="/auth"
                className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-95 active:scale-95"
              >
                Sign in
              </Link>
            </>
          ))}
        </div>
      </div>
    </header>
  );
}

export function AppFooter() {
  return (
    <footer className="mt-10 border-t border-border bg-secondary/40 px-6 pb-10 pt-8 md:px-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Wordmark />
        <div className="flex gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-full border border-border bg-card text-foreground/60">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor"><path d="M22 5.8a8.5 8.5 0 0 1-2.4.7 4.2 4.2 0 0 0 1.8-2.3 8.3 8.3 0 0 1-2.6 1 4.2 4.2 0 0 0-7.1 3.8A11.8 11.8 0 0 1 3 4.7a4.2 4.2 0 0 0 1.3 5.6 4.1 4.1 0 0 1-1.9-.5v.1a4.2 4.2 0 0 0 3.4 4.1 4.2 4.2 0 0 1-1.9.1 4.2 4.2 0 0 0 3.9 2.9A8.4 8.4 0 0 1 2 18.6 11.8 11.8 0 0 0 8.4 20c7.7 0 11.9-6.4 11.9-11.9v-.5A8.5 8.5 0 0 0 22 5.8Z"/></svg>
          </span>
          <span className="grid h-9 w-9 place-items-center rounded-full border border-border bg-card text-foreground/60">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor"><path d="M12 2.2c-5.4 0-9.8 4.4-9.8 9.8 0 4.3 2.8 8 6.7 9.3.5.1.7-.2.7-.5v-1.7c-2.7.6-3.3-1.3-3.3-1.3-.4-1.1-1.1-1.4-1.1-1.4-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.5 2.3 1.1 2.9.8.1-.6.3-1.1.6-1.3-2.2-.3-4.5-1.1-4.5-4.9 0-1.1.4-2 1-2.7-.1-.3-.4-1.3.1-2.7 0 0 .8-.3 2.7 1a9.4 9.4 0 0 1 5 0c1.9-1.3 2.7-1 2.7-1 .5 1.4.2 2.4.1 2.7.6.7 1 1.6 1 2.7 0 3.8-2.3 4.6-4.5 4.9.3.3.6.8.6 1.7v2.5c0 .3.2.6.7.5 3.9-1.3 6.7-5 6.7-9.3 0-5.4-4.4-9.8-9.8-9.8Z"/></svg>
          </span>
        </div>
      </div>
      <p className="mt-6 text-xs text-muted-foreground">
        © {new Date().getFullYear()} Boostify · <Link to="/vendor/register" className="hover:text-foreground">Apply as partner</Link>
      </p>
    </footer>
  );
}

type NavItem = {
  to: "/" | "/track" | "/vendor/register" | "/auth" | "/admin" | "/vendor";
  label: string;
  match: (path: string) => boolean;
  icon: ReactNode;
};

const HOME_ITEM: NavItem = {
  to: "/",
  label: "Home",
  match: (p) => p === "/",
  icon: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5 10v10h14V10" />
    </svg>
  ),
};

const RESTAURANT_ITEM: NavItem = {
  to: "/vendor/register",
  label: "Apply",
  match: (p) => p.startsWith("/vendor/register"),
  icon: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 3v8a4 4 0 0 0 8 0V3" />
      <path d="M9 3v6" />
      <path d="M17 3c2 1 3 4 3 7s-1 4-3 4v7" />
    </svg>
  ),
};

const ACCOUNT_ICON = (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c1.5-4 5-6 8-6s6.5 2 8 6" />
  </svg>
);


export function BottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user, isAdmin, isVendor } = useAuth();
  const items: NavItem[] = [HOME_ITEM, RESTAURANT_ITEM];
  if (user) {
    items.push({
      to: isAdmin ? "/admin" : isVendor ? "/vendor" : "/auth",
      label: "Account",
      match: (p) => p.startsWith("/admin") || p.startsWith("/vendor") && !p.startsWith("/vendor/register") || p.startsWith("/profile"),
      icon: ACCOUNT_ICON,
    });
  } else {
    items.push({
      to: "/auth",
      label: "Sign in",
      match: (p) => p.startsWith("/auth"),
      icon: ACCOUNT_ICON,
    });
  }
  const NAV_ITEMS = items;
  return (
    <nav
      aria-label="Primary"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-[460px] px-3 pb-3 md:hidden"
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      <div className="pointer-events-auto mx-auto flex items-center justify-between gap-1 rounded-[28px] border border-border bg-card/95 p-1.5 shadow-[0_18px_40px_-18px_rgba(13,27,42,0.35)] backdrop-blur-xl">
        {NAV_ITEMS.map((item) => {
          const active = item.match(pathname);
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`relative flex flex-1 flex-col items-center justify-center gap-0.5 rounded-[22px] px-2 py-2 text-[10px] font-semibold uppercase tracking-wider transition-all duration-300 active:scale-90 ${
                active
                  ? "bg-foreground text-background shadow-[0_8px_20px_-10px_rgba(13,27,42,0.6)]"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <span className={`transition-transform duration-300 ${active ? "-translate-y-0.5 scale-110" : ""}`}>
                {item.icon}
              </span>
              <span>{item.label}</span>
              {active && (
                <span className="absolute -top-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-mint" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
