import { createFileRoute, Link, useNavigate, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList, MessageSquare, Settings, Store, UserCircle, Power } from "lucide-react";
import { Wordmark } from "@/components/site/public-shell";
import { supabase } from "@/integrations/app-supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/vendor")({
  beforeLoad: async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) throw redirect({ to: "/auth" });
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", u.user.id);
    const list = (roles ?? []).map((r) => r.role);
    if (!list.includes("vendor")) {
      throw redirect({ to: "/customer" });
    }
  },
  component: VendorHome,
});

function VendorHome() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  };

  const vendorQ = useQuery({
    queryKey: ["vendor-self", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("vendors")
        .select("id, store_name, logo_url, cover_url, is_open, status")
        .eq("owner_id", user!.id)
        .maybeSingle();
      return data;
    },
  });

  const statsQ = useQuery({
    queryKey: ["vendor-stats", vendorQ.data?.id],
    enabled: !!vendorQ.data?.id,
    queryFn: async () => {
      const vid = vendorQ.data!.id;
      const [active, today, threads] = await Promise.all([
        supabase.from("orders").select("id", { count: "exact", head: true }).eq("vendor_id", vid).in("status", ["pending", "accepted", "preparing", "on_the_way"]),
        supabase.from("orders").select("id", { count: "exact", head: true }).eq("vendor_id", vid).eq("status", "delivered").gte("created_at", new Date(new Date().setHours(0, 0, 0, 0)).toISOString()),
        supabase.from("chat_threads").select("id", { count: "exact", head: true }).eq("vendor_id", vid),
      ]);
      return {
        active: active.count ?? 0,
        today: today.count ?? 0,
        threads: threads.count ?? 0,
      };
    },
  });

  const v = vendorQ.data;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Wordmark />
          <div className="flex items-center gap-3 text-sm">
            <Link to="/profile" className="hidden text-muted-foreground hover:text-foreground md:inline">{user?.email}</Link>
            <button onClick={signOut} className="rounded-full border border-border px-3 py-1.5 text-xs">
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        <section className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-primary/10 via-card to-card p-6 md:p-8">
          {v?.cover_url && (
            <div
              className="absolute inset-0 opacity-20"
              style={{ backgroundImage: `url(${v.cover_url})`, backgroundSize: "cover", backgroundPosition: "center" }}
            />
          )}
          <div className="relative flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-border bg-background flex items-center justify-center">
                {v?.logo_url ? (
                  <img src={v.logo_url} alt={v.store_name} className="h-full w-full object-cover" />
                ) : (
                  <Store className="h-7 w-7 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Welcome back</p>
                <h1 className="font-display text-2xl font-bold truncate md:text-3xl">
                  {v?.store_name ?? "Your storefront"}
                </h1>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                  {v?.status && (
                    <span className="rounded-full bg-background px-2.5 py-0.5 font-medium capitalize">
                      {v.status}
                    </span>
                  )}
                  {v && (
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-medium ${v.is_open ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : "bg-muted text-muted-foreground"}`}>
                      <Power className="h-3 w-3" /> {v.is_open ? "Accepting orders" : "Paused"}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link to="/vendor/settings" className="inline-flex items-center gap-2 rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background">
                <Settings className="h-4 w-4" /> Business settings
              </Link>
              <Link to="/messages" className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
                <MessageSquare className="h-4 w-4" /> Message ops
              </Link>
            </div>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Active orders" value={statsQ.data?.active ?? 0} icon={<ClipboardList className="h-5 w-5" />} />
          <StatCard label="Delivered today" value={statsQ.data?.today ?? 0} icon={<Store className="h-5 w-5" />} />
          <StatCard label="Conversations" value={statsQ.data?.threads ?? 0} icon={<MessageSquare className="h-5 w-5" />} />
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <ActionTile
            to="/vendor/settings"
            title="Business settings"
            description="Update logo, cover, contact info and availability."
            icon={<Settings className="h-5 w-5" />}
          />
          <ActionTile
            to="/profile"
            title="My profile"
            description="Avatar, name, password and account email."
            icon={<UserCircle className="h-5 w-5" />}
          />
          <ActionTile
            to="/messages"
            title="Chat with Boostify ops"
            description="Reach the team for support or operations questions."
            icon={<MessageSquare className="h-5 w-5" />}
          />
          <ActionTile
            to="/vendor"
            title="Orders (coming soon)"
            description="Live orders queue and history will land here next."
            icon={<ClipboardList className="h-5 w-5" />}
            disabled
          />
        </section>
      </main>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-border bg-card p-5">
      <div className="flex items-center justify-between text-muted-foreground">
        <p className="text-sm">{label}</p>
        <span>{icon}</span>
      </div>
      <p className="mt-2 font-display text-3xl font-bold">{value}</p>
    </div>
  );
}

function ActionTile({
  to,
  title,
  description,
  icon,
  disabled,
}: {
  to: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  disabled?: boolean;
}) {
  const inner = (
    <div className={`group flex h-full items-start gap-4 rounded-3xl border border-border bg-card p-5 transition ${disabled ? "opacity-60" : "hover:border-primary/40 hover:shadow-sm"}`}>
      <div className="rounded-2xl bg-primary/10 p-3 text-primary">{icon}</div>
      <div className="min-w-0">
        <p className="font-display text-lg font-semibold">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
  if (disabled) return inner;
  return <Link to={to}>{inner}</Link>;
}
