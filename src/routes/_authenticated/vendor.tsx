import { createFileRoute, Link, useNavigate, redirect } from "@tanstack/react-router";
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

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Wordmark />
          <nav className="hidden gap-5 text-sm font-medium md:flex">
            <Link to="/vendor" className="text-foreground">Dashboard</Link>
          </nav>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-muted-foreground md:inline">{user?.email}</span>
            <button onClick={signOut} className="rounded-full border border-border px-3 py-1.5 text-xs">
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-10">
        <div className="rounded-3xl bg-foreground p-8 text-background">
          <h1 className="font-display text-3xl font-bold">Vendor dashboard</h1>
          <p className="mt-2 opacity-70">
            Orders, menu, chat with ops and store settings will appear here as we build out the vendor experience.
          </p>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {[
            { label: "Active orders", value: "—" },
            { label: "Delivered today", value: "—" },
            { label: "Pending pickup", value: "—" },
          ].map((k) => (
            <div key={k.label} className="rounded-3xl border border-border bg-card p-6">
              <p className="text-sm text-muted-foreground">{k.label}</p>
              <p className="mt-2 font-display text-3xl font-bold">{k.value}</p>
            </div>
          ))}
        </div>

        <div className="mt-6">
          <Link
            to="/messages"
            className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
          >
            Message Boostify ops →
          </Link>
        </div>
      </main>
    </div>
  );
}
