import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/app-supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Wordmark } from "@/components/site/public-shell";

export const Route = createFileRoute("/_authenticated/customer")({
  component: CustomerHome,
});

function CustomerHome() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data: vendor } = useQuery({
    queryKey: ["my-vendor", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendors")
        .select("status, store_name")
        .eq("owner_id", user!.id)
        .order("created_at", { ascending: false })
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
          <Wordmark />
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-muted-foreground sm:inline">{user?.email}</span>
            <button onClick={signOut} className="rounded-full border border-border px-3 py-1.5 text-xs">
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-10">
        <h1 className="font-display text-3xl font-bold">Welcome 👋</h1>
        <p className="mt-2 text-muted-foreground">
          Order from your favourite kitchens and track every step.
        </p>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <Link to="/track" className="group rounded-3xl border border-border bg-card p-6 transition hover:border-primary">
            <h2 className="font-display text-lg font-semibold">Track an order</h2>
            <p className="mt-1 text-sm text-muted-foreground">Enter a Boostify tracking number.</p>
            <span className="mt-4 inline-flex text-sm font-semibold text-primary">Open tracker →</span>
          </Link>

          {vendor ? (
            <div className="rounded-3xl border border-border bg-card p-6">
              <h2 className="font-display text-lg font-semibold">Your store</h2>
              <p className="mt-1 text-sm text-muted-foreground">{vendor.store_name}</p>
              <span
                className={`mt-3 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                  vendor.status === "approved"
                    ? "bg-primary/10 text-primary"
                    : vendor.status === "rejected"
                    ? "bg-destructive/10 text-destructive"
                    : "bg-secondary text-muted-foreground"
                }`}
              >
                {vendor.status.toUpperCase()}
              </span>
              {vendor.status === "approved" && (
                <Link to="/vendor" className="mt-4 inline-flex text-sm font-semibold text-primary">
                  Go to vendor dashboard →
                </Link>
              )}
            </div>
          ) : (
            <Link to="/vendor/register" className="rounded-3xl border border-border bg-card p-6 hover:border-primary">
              <h2 className="font-display text-lg font-semibold">Run a kitchen?</h2>
              <p className="mt-1 text-sm text-muted-foreground">Apply to sell on Boostify.</p>
              <span className="mt-4 inline-flex text-sm font-semibold text-primary">Apply now →</span>
            </Link>
          )}
        </div>
      </main>
    </div>
  );
}
