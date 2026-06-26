import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
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

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4 sm:gap-3">
          <div className="min-w-0 flex-1"><Wordmark /></div>
          <span className="shrink-0 whitespace-nowrap rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground sm:text-xs">
            {isSuperAdmin ? "SUPER ADMIN" : "ADMIN"}
          </span>
          <span className="hidden truncate text-sm text-muted-foreground md:inline">{user?.email}</span>
          <button onClick={signOut} className="shrink-0 whitespace-nowrap rounded-full border border-border px-3 py-1.5 text-xs">
            Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-10">
        <h1 className="font-display text-3xl font-bold">Operations</h1>
        <p className="mt-2 text-muted-foreground">Manage vendors, orders, users and system settings.</p>

        <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Link to="/admin/partners" className="rounded-3xl border border-border bg-card p-6 hover:border-primary">
            <p className="font-display text-lg font-semibold">Partner applications</p>
            <p className="mt-1 text-sm text-muted-foreground">Review and approve restaurants applying to join Boostify.</p>
          </Link>
          <Link to="/admin/users" className="rounded-3xl border border-border bg-card p-6 hover:border-primary">
            <p className="font-display text-lg font-semibold">Users & roles</p>
            <p className="mt-1 text-sm text-muted-foreground">Create admins, vendors. Set permissions.</p>
          </Link>
          <Link to="/messages" className="rounded-3xl border border-border bg-card p-6 hover:border-primary">
            <p className="font-display text-lg font-semibold">Partner messages</p>
            <p className="mt-1 text-sm text-muted-foreground">Chat directly with your partner restaurants.</p>
          </Link>
          <Link to="/profile" className="rounded-3xl border border-border bg-card p-6 hover:border-primary">
            <p className="font-display text-lg font-semibold">My profile</p>
            <p className="mt-1 text-sm text-muted-foreground">Update your name, phone, password.</p>
          </Link>
          <Link to="/admin/settings" className="rounded-3xl border border-border bg-card p-6 hover:border-primary">
            <p className="font-display text-lg font-semibold">System settings</p>
            <p className="mt-1 text-sm text-muted-foreground">Name, logo, colors, fonts, SEO.</p>
          </Link>
        </div>
      </main>
    </div>
  );
}
