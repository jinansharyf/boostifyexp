import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ClipboardList,
  MessageSquare,
  Settings,
  ShieldCheck,
  Store,
  UserCircle,
  Users,
} from "lucide-react";
import { Wordmark } from "@/components/site/public-shell";
import { supabase } from "@/integrations/app-supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: AdminHome,
});

function AdminHome() {
  const { user, isSuperAdmin } = useAuth();
  const navigate = useNavigate();
  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  };

  const stats = useQuery({
    queryKey: ["admin-home-stats"],
    queryFn: async () => {
      const [pending, vendors, threads] = await Promise.all([
        supabase
          .from("partner_applications" as any)
          .select("id", { count: "exact", head: true })
          .eq("status", "pending"),
        supabase
          .from("user_roles")
          .select("user_id", { count: "exact", head: true })
          .eq("role", "vendor"),
        supabase.from("chat_threads").select("id", { count: "exact", head: true }),
      ]);
      return {
        pending: pending.count ?? 0,
        vendors: vendors.count ?? 0,
        threads: threads.count ?? 0,
      };
    },
  });

  const tiles = [
    {
      to: "/admin/partners",
      label: "Partner applications",
      desc: "Review and approve restaurants applying to join.",
      icon: ClipboardList,
      badge: stats.data?.pending ? `${stats.data.pending} pending` : null,
      accent: "from-amber-500/15 to-amber-500/0 text-amber-600 dark:text-amber-400",
    },
    {
      to: "/admin/users",
      label: "Users & roles",
      desc: "Create admins, partners. Set permissions.",
      icon: Users,
      accent: "from-sky-500/15 to-sky-500/0 text-sky-600 dark:text-sky-400",
    },
    {
      to: "/admin/staff",
      label: "Delivery staff",
      desc: "Managers, supervisors, officers with zone visibility.",
      icon: Users,
      accent: "from-blue-500/15 to-blue-500/0 text-blue-600 dark:text-blue-400",
    },
    {
      to: "/admin/vendors",
      label: "Partners",
      desc: "Edit, suspend, block or remove approved partners.",
      icon: Store,
      badge: stats.data?.vendors ? `${stats.data.vendors} active` : null,
      accent: "from-teal-500/15 to-teal-500/0 text-teal-600 dark:text-teal-400",
    },
    {
      to: "/admin/vendor-requests",
      label: "Partner change requests",
      desc: "Review business-info edits submitted by partners.",
      icon: ClipboardList,
      accent: "from-orange-500/15 to-orange-500/0 text-orange-600 dark:text-orange-400",
    },
    {
      to: "/admin/orders",
      label: "Orders",
      desc: "View and update delivery order status.",
      icon: ClipboardList,
      accent: "from-indigo-500/15 to-indigo-500/0 text-indigo-600 dark:text-indigo-400",
    },
    {
      to: "/admin/pricing",
      label: "Delivery pricing",
      desc: "Manage zones, vehicles and per-delivery prices.",
      icon: Settings,
      accent: "from-fuchsia-500/15 to-fuchsia-500/0 text-fuchsia-600 dark:text-fuchsia-400",
    },
    {
      to: "/admin/order-fields",
      label: "Order form fields",
      desc: "Custom fields shown in the partner order dialog.",
      icon: ClipboardList,
      accent: "from-cyan-500/15 to-cyan-500/0 text-cyan-600 dark:text-cyan-400",
    },
    {
      to: "/admin/billing",
      label: "Partner billing",
      desc: "Outstanding balances and recorded payments.",
      icon: ClipboardList,
      accent: "from-lime-500/15 to-lime-500/0 text-lime-600 dark:text-lime-400",
    },
    {
      to: "/messages",
      label: "Partner messages",
      desc: "Chat directly with your partner restaurants.",
      icon: MessageSquare,
      badge: stats.data?.threads ? `${stats.data.threads} threads` : null,
      accent: "from-emerald-500/15 to-emerald-500/0 text-emerald-600 dark:text-emerald-400",
    },
    {
      to: "/profile",
      label: "My profile",
      desc: "Update your name, phone, password.",
      icon: UserCircle,
      accent: "from-violet-500/15 to-violet-500/0 text-violet-600 dark:text-violet-400",
    },
    {
      to: "/admin/settings",
      label: "System settings",
      desc: "Name, logo, colors, fonts, SEO.",
      icon: Settings,
      accent: "from-rose-500/15 to-rose-500/0 text-rose-600 dark:text-rose-400",
    },
    {
      to: "/admin/landing",
      label: "Landing page",
      desc: "Edit hero, stats, features and CTA shown on the homepage.",
      icon: Settings,
      accent: "from-pink-500/15 to-pink-500/0 text-pink-600 dark:text-pink-400",
    },
    {
      to: "/admin/setup",
      label: "Database setup",
      desc: "Check required tables/columns and get SQL to run in order.",
      icon: ShieldCheck,
      accent: "from-slate-500/15 to-slate-500/0 text-slate-600 dark:text-slate-400",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto grid h-16 max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-4 sm:gap-3">
          <div className="min-w-0"><Wordmark /></div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary sm:inline-flex">
              <ShieldCheck className="h-3.5 w-3.5" />
              {isSuperAdmin ? "SUPER ADMIN" : "ADMIN"}
            </span>
            <span className="hidden truncate text-sm text-muted-foreground lg:inline">{user?.email}</span>
            <button
              onClick={signOut}
              className="whitespace-nowrap rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:bg-secondary"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:py-10">
        <div className="flex flex-col gap-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Welcome back{user?.email ? `, ${user.email.split("@")[0]}` : ""}
          </p>
          <h1 className="font-display text-3xl font-bold sm:text-4xl">Operations</h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            Everything you need to run Boostify in one place.
          </p>
        </div>

        {/* Live stats */}
        <div className="mt-6 grid grid-cols-3 gap-3 sm:gap-4">
          <StatCard
            label="Pending applications"
            value={stats.data?.pending ?? "—"}
            tone="amber"
            icon={ClipboardList}
            to="/admin/partners"
          />
          <StatCard
            label="Active partners"
            value={stats.data?.vendors ?? "—"}
            tone="emerald"
            icon={Store}
            to="/admin/vendors"
          />
          <StatCard
            label="Open chats"
            value={stats.data?.threads ?? "—"}
            tone="sky"
            icon={MessageSquare}
            to="/messages"
          />
        </div>

        {/* Quick actions */}
        <h2 className="mt-8 font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Quick actions
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tiles.map((t) => {
            const Icon = t.icon;
            return (
              <Link
                key={t.to}
                to={t.to}
                className="group relative overflow-hidden rounded-2xl border border-border bg-card p-5 transition hover:-translate-y-0.5 hover:border-primary hover:shadow-lg"
              >
                <div
                  className={`pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-gradient-to-br ${t.accent} opacity-70 blur-2xl`}
                />
                <div className="relative flex items-start gap-3">
                  <div
                    className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br ${t.accent}`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-display text-base font-semibold">{t.label}</p>
                      {t.badge && (
                        <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
                          {t.badge}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{t.desc}</p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </main>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
  icon: Icon,
  to,
}: {
  label: string;
  value: number | string;
  tone: "amber" | "emerald" | "sky";
  icon: typeof ClipboardList;
  to: string;
}) {
  const tones: Record<string, string> = {
    amber: "text-amber-600 dark:text-amber-400 bg-amber-500/10",
    emerald: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10",
    sky: "text-sky-600 dark:text-sky-400 bg-sky-500/10",
  };
  return (
    <Link
      to={to}
      className="block rounded-2xl border border-border bg-card p-3 transition hover:-translate-y-0.5 hover:border-primary hover:shadow-md sm:p-4"
    >
      <div className={`mb-2 inline-flex h-8 w-8 items-center justify-center rounded-lg ${tones[tone]}`}>
        <Icon className="h-4 w-4" />
      </div>
      <p className="font-display text-2xl font-bold leading-none sm:text-3xl">{value}</p>
      <p className="mt-1 text-[11px] text-muted-foreground sm:text-xs">{label}</p>
    </Link>
  );
}
