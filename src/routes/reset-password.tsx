import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/app-supabase/client";
import { PublicShell, BoltLogo } from "@/components/site/public-shell";
import { toast } from "sonner";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Set a new password — Boostify" },
      { name: "description", content: "Choose a new password for your Boostify account." },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);

  // Establish the recovery session from whichever URL format Supabase used:
  //  - PKCE:        ?code=...
  //  - OTP link:    ?token_hash=...&type=recovery
  //  - Legacy hash: #access_token=...&refresh_token=...&type=recovery
  useEffect(() => {
    let cancelled = false;

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });

    (async () => {
      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");
        const tokenHash = url.searchParams.get("token_hash");
        const type = url.searchParams.get("type");
        const hash = window.location.hash.startsWith("#")
          ? new URLSearchParams(window.location.hash.slice(1))
          : null;
        const errDesc = url.searchParams.get("error_description") || hash?.get("error_description");

        if (errDesc) {
          setError(errDesc);
          return;
        }

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else if (tokenHash && type) {
          const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: type as "recovery",
          });
          if (error) throw error;
        } else if (hash?.get("access_token") && hash.get("refresh_token")) {
          const { error } = await supabase.auth.setSession({
            access_token: hash.get("access_token")!,
            refresh_token: hash.get("refresh_token")!,
          });
          if (error) throw error;
        }

        // Clean recovery params from the URL so a refresh doesn't re-trigger them.
        if (code || tokenHash || hash?.get("access_token")) {
          window.history.replaceState({}, "", window.location.pathname);
        }

        const { data } = await supabase.auth.getSession();
        if (!cancelled && data.session) setReady(true);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Invalid or expired link");
      }
    })();

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("Use at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords don't match.");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      // Clear the must_change_password flag if it was set by an admin invite.
      try {
        const { data } = await supabase.auth.getUser();
        if (data.user) {
          await supabase
            .from("profiles")
            .update({ must_change_password: false })
            .eq("id", data.user.id);
        }
      } catch {
        // non-blocking
      }
      toast.success("Password updated. You're signed in.");
      navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <PublicShell>
      <section className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-md flex-col justify-center px-4 py-12">
        <div className="rounded-3xl border border-border bg-card p-8 shadow-sm">
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            <BoltLogo className="h-3.5 w-3.5" /> New password
          </div>
          <h1 className="mt-4 font-display text-2xl font-bold">Set a new password</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Pick something memorable but strong. Min 8 characters.
          </p>

          {error ? (
            <div className="mt-6 rounded-2xl bg-destructive/10 p-4 text-sm text-destructive">
              {error}. Request a fresh link from{" "}
              <Link to="/auth/forgot-password" className="text-primary underline">
                Forgot password
              </Link>
              .
            </div>
          ) : !ready ? (
            <div className="mt-6 rounded-2xl bg-secondary p-4 text-sm text-muted-foreground">
              Verifying your reset link…
            </div>
          ) : (
            <form onSubmit={submit} className="mt-6 space-y-4">
              <div>
                <label className="text-sm font-medium">New password</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Confirm password</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-full bg-primary py-3 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
              >
                {loading ? "Saving..." : "Save new password"}
              </button>
            </form>
          )}
        </div>
      </section>
    </PublicShell>
  );
}
