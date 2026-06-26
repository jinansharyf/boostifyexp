import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, type FormEvent } from "react";
import { PublicShell, BoltLogo } from "@/components/site/public-shell";
import { requestPasswordResetEmail } from "@/lib/password-reset.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/auth/forgot-password")({
  head: () => ({
    meta: [
      { title: "Forgot password — Boostify" },
      { name: "description", content: "Reset your Boostify account password." },
    ],
  }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const requestReset = useServerFn(requestPasswordResetEmail);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const RESEND_KEY = "boostify:pwreset:lastSent";
  const COOLDOWN_S = 60;

  useEffect(() => {
    const tick = () => {
      const last = Number(localStorage.getItem(RESEND_KEY) || 0);
      const remaining = Math.max(0, COOLDOWN_S - Math.floor((Date.now() - last) / 1000));
      setCooldown(remaining);
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  const sendReset = async (targetEmail: string) => {
    const last = Number(localStorage.getItem(RESEND_KEY) || 0);
    const remaining = Math.max(0, COOLDOWN_S - Math.floor((Date.now() - last) / 1000));
    if (remaining > 0) {
      toast.error(`Please wait ${remaining}s before requesting another email.`);
      return false;
    }
    await requestReset({
      data: { email: targetEmail, redirectOrigin: window.location.origin },
    });
    localStorage.setItem(RESEND_KEY, String(Date.now()));
    setCooldown(COOLDOWN_S);
    return true;
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const ok = await sendReset(email);
      if (ok) {
        setSent(true);
        toast.success("If that email exists, a reset link is on its way.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    setLoading(true);
    try {
      const ok = await sendReset(email);
      if (ok) toast.success("Reset email resent.");
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
            <BoltLogo className="h-3.5 w-3.5" /> Reset password
          </div>
          <h1 className="mt-4 font-display text-2xl font-bold">Forgot your password?</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Enter the email tied to your Boostify account and we'll send a secure reset link.
          </p>

          {sent ? (
            <div className="mt-6 space-y-3">
              <div className="rounded-2xl bg-secondary p-4 text-sm">
                Check <span className="font-semibold">{email}</span> for a reset link. The link
                opens the password reset page in this app.
              </div>
              <button
                type="button"
                onClick={resend}
                disabled={loading || cooldown > 0}
                className="w-full rounded-full border border-input bg-background py-3 text-sm font-semibold transition hover:bg-secondary disabled:opacity-60"
              >
                {cooldown > 0 ? `Resend in ${cooldown}s` : loading ? "Resending..." : "Resend reset email"}
              </button>
            </div>
          ) : (
            <form onSubmit={submit} className="mt-6 space-y-4">
              <div>
                <label className="text-sm font-medium">Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-full bg-primary py-3 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
              >
                {loading ? "Sending..." : "Send reset link"}
              </button>
            </form>
          )}

          <p className="mt-6 text-center text-xs text-muted-foreground">
            Remembered it?{" "}
            <Link to="/auth" className="text-primary underline">
              Back to sign in
            </Link>
          </p>
        </div>
      </section>
    </PublicShell>
  );
}
