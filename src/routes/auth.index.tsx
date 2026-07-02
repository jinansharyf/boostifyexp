import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/app-supabase/client";
import { BoltMark, Wordmark } from "@/components/site/public-shell";
import { toast } from "sonner";

export const Route = createFileRoute("/auth/")({
  head: () => ({
    meta: [
      { title: "Sign in — Boostify" },
      { name: "description", content: "Sign in or create your Boostify account." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [signupAllowed, setSignupAllowed] = useState<boolean | null>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard" });
    });
  }, [navigate]);

  useEffect(() => {
    let cancelled = false;
    supabase
      .rpc("has_super_admin")
      .then(({ data, error }) => {
        if (cancelled) return;
        // If the RPC is missing or errors, hide signup to be safe.
        const allowed = !error && data === false;
        setSignupAllowed(allowed);
        if (!allowed) setMode("signIn");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (mode === "signUp" && signupAllowed === false) {
      toast.error("Sign up is disabled.");
      return;
    }
    if (mode === "signUp" && password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      if (mode === "signUp") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { full_name: fullName.trim() || null },
          },
        });
        if (error) throw error;
        if (data.session) {
          toast.success("Account created. Welcome to Boostify!");
          navigate({ to: "/dashboard" });
        } else {
          toast.success("Account created. Check your email to confirm your account.");
          setMode("signIn");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Welcome back!");
        navigate({ to: "/dashboard" });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen bg-background md:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      {/* Brand panel — hidden on mobile, hero on desktop */}
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-ink via-forest to-ink text-mint-foreground md:flex md:flex-col md:justify-between md:p-12">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -left-20 -top-16 h-[420px] w-[420px] rounded-full bg-mint/25 blur-3xl" />
          <div className="absolute -bottom-24 -right-10 h-[380px] w-[380px] rounded-full bg-primary/30 blur-3xl" />
          <svg className="absolute inset-0 h-full w-full opacity-[0.08]" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
                <path d="M32 0H0V32" fill="none" stroke="currentColor" strokeWidth="1" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>
        </div>

        <div className="relative">
          <Wordmark />
        </div>

        <div className="relative max-w-md">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-mint">
            <span className="h-1.5 w-1.5 rounded-full bg-mint" /> Boostify Ops
          </span>
          <h1 className="mt-5 font-display text-[2.6rem] font-extrabold leading-[1.05] tracking-tight">
            One account.
            <br />
            Every parcel,
            <br />
            <span className="italic text-mint">tracked.</span>
          </h1>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/70">
            Customers, vendors and ops in one place. Sign in to keep every delivery moving —
            or create a new account in seconds.
          </p>

          <ul className="mt-8 grid gap-3 text-sm">
            {[
              "Live status timeline",
              "Direct chat with ops",
              "Saved delivery history",
            ].map((f) => (
              <li key={f} className="flex items-center gap-3">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-mint text-mint-foreground">
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m5 12 5 5L20 7" />
                  </svg>
                </span>
                <span className="text-white/85">{f}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative flex items-center gap-3 text-xs text-white/50">
          <span className="h-px flex-1 bg-white/15" />
          <span>© {new Date().getFullYear()} Boostify</span>
          <span className="h-px flex-1 bg-white/15" />
        </div>
      </aside>

      {/* Form panel */}
      <main className="relative flex min-h-screen items-center justify-center px-5 py-10 sm:px-8">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-0 md:hidden">
          <div className="absolute -left-24 -top-32 h-[360px] w-[360px] rounded-full bg-mint/40 blur-3xl" />
          <div className="absolute -right-16 top-20 h-[300px] w-[300px] rounded-full bg-primary/20 blur-3xl" />
        </div>

        <div className="relative w-full max-w-md">
          {/* Mobile brand row */}
          <div className="mb-8 flex items-center justify-between md:hidden">
            <Wordmark />
            <Link to="/" className="text-xs font-semibold text-muted-foreground hover:text-foreground">
              ← Home
            </Link>
          </div>

          <div className="rounded-[28px] border border-border/70 bg-card/90 p-7 shadow-[0_30px_80px_-40px_color-mix(in_oklab,var(--ink)_55%,transparent)] backdrop-blur-xl sm:p-9">
            <div className="mb-6 space-y-1">
              <h2 className="font-display text-2xl font-extrabold tracking-tight">
                {mode === "signUp" ? "Create account" : "Welcome back"}
              </h2>
              <p className="text-sm text-muted-foreground">
                {mode === "signUp"
                  ? "Sign up for a Boostify customer account."
                  : "Sign in to your Boostify partner or ops account."}
              </p>
            </div>

            <div className="grid grid-cols-2 rounded-full border border-border bg-secondary/50 p-1 text-sm font-semibold">
              <button
                type="button"
                onClick={() => setMode("signIn")}
                className={`rounded-full px-3 py-2 transition ${mode === "signIn" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                Sign in
              </button>
              {signupAllowed !== false && (
                <button
                  type="button"
                  onClick={() => setMode("signUp")}
                  disabled={signupAllowed === null}
                  className={`rounded-full px-3 py-2 transition disabled:opacity-50 ${mode === "signUp" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                  Sign up
                </button>
              )}
            </div>

            <form onSubmit={submit} className="mt-6 space-y-4">
              {mode === "signUp" && (
                <Field label="Full name" value={fullName} onChange={setFullName} autoComplete="name" required />
              )}
              <Field label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" required />
              <Field
                label="Password"
                type="password"
                value={password}
                onChange={setPassword}
                autoComplete={mode === "signUp" ? "new-password" : "current-password"}
                minLength={6}
                required
              />
              {mode === "signUp" && (
                <Field
                  label="Confirm password"
                  type="password"
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  autoComplete="new-password"
                  minLength={6}
                  required
                />
              )}

              <button
                type="submit"
                disabled={loading}
                className="group relative mt-2 flex w-full items-center justify-center gap-2 overflow-hidden rounded-full bg-foreground py-3 text-sm font-semibold text-background shadow-[0_16px_30px_-16px_color-mix(in_oklab,var(--ink)_75%,transparent)] transition hover:opacity-95 active:scale-[0.99] disabled:opacity-60"
              >
                <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/15 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
                <span className="relative">{loading ? "Please wait…" : mode === "signUp" ? "Create account" : "Sign in"}</span>
                {!loading && (
                  <BoltMark className="relative h-4 w-4" />
                )}
              </button>
            </form>

            {mode === "signIn" && (
              <p className="mt-5 text-center text-xs">
                <Link to="/auth/forgot-password" className="font-medium text-muted-foreground hover:text-foreground">
                  Forgot your password?
                </Link>
              </p>
            )}

            <div className="my-6 flex items-center gap-3 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              or
              <span className="h-px flex-1 bg-border" />
            </div>

            <Link
              to="/vendor/register"
              className="flex items-center justify-between rounded-2xl border border-border bg-secondary/40 px-4 py-3 text-sm font-semibold transition hover:border-primary/60 hover:bg-secondary"
            >
              <span className="flex items-center gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary">
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 9h18l-2 10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L3 9Z" />
                    <path d="M8 9V6a4 4 0 0 1 8 0v3" />
                  </svg>
                </span>
                <span>
                  <span className="block">Run a store?</span>
                  <span className="block text-xs font-normal text-muted-foreground">Apply as a vendor</span>
                </span>
              </span>
              <span aria-hidden className="text-lg text-muted-foreground">→</span>
            </Link>
          </div>

          <p className="mt-6 text-center text-[11px] leading-relaxed text-muted-foreground">
            By continuing you agree to our terms and privacy policy.
          </p>
        </div>
      </main>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required,
  minLength,
  autoComplete,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  minLength?: number;
  autoComplete?: string;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center justify-between text-xs font-semibold text-foreground/80">
        {label}
        {hint && <span className="font-normal text-muted-foreground">{hint}</span>}
      </span>
      <input
        type={type}
        required={required}
        minLength={minLength}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-input bg-background px-3.5 py-3 text-sm shadow-inner outline-none transition placeholder:text-muted-foreground/60 focus:border-primary focus:ring-4 focus:ring-primary/15"
      />
    </label>
  );
}
