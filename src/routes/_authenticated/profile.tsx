import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/app-supabase/client";
import { Wordmark } from "@/components/site/public-shell";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const navigate = useNavigate();
  const { user, roles, isSuperAdmin, isAdmin, isVendor } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    if (!user) return;
    setEmail(user.email ?? "");
    supabase
      .from("profiles")
      .select("full_name, phone")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        setFullName(data?.full_name ?? "");
        setPhone(data?.phone ?? "");
        setLoading(false);
      });
  }, [user]);

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: fullName, phone })
        .eq("id", user.id);
      if (error) throw error;
      toast.success("Profile updated.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save profile");
    } finally {
      setSaving(false);
    }
  };

  const changeEmail = async () => {
    if (!email || email === user?.email) return;
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ email });
      if (error) throw error;
      toast.success("Check your new email to confirm the change.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update email");
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) return toast.error("Use at least 8 characters.");
    if (newPassword !== confirmPassword) return toast.error("Passwords don't match.");
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      if (user) {
        await supabase.from("profiles").update({ must_change_password: false }).eq("id", user.id);
      }
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Password updated.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update password");
    } finally {
      setSaving(false);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  };

  const dashboardLink = isSuperAdmin || isAdmin ? "/admin" : isVendor ? "/vendor" : "/customer";

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4">
          <Wordmark />
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-muted-foreground md:inline">{user?.email}</span>
            <button onClick={signOut} className="rounded-full border border-border px-3 py-1.5 text-xs">
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-10">
        <div>
          <Link to={dashboardLink} className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            ← Back to dashboard
          </Link>
          <h1 className="font-display text-3xl font-bold">My profile</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Signed in as <span className="font-semibold">{roles.join(", ") || "customer"}</span>
          </p>
        </div>

        {loading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : (
          <>
            <section className="rounded-3xl border border-border bg-card p-6">
              <h2 className="font-display text-lg font-semibold">Personal details</h2>
              <form onSubmit={saveProfile} className="mt-4 space-y-4">
                <Field label="Full name" value={fullName} onChange={setFullName} />
                <Field label="Phone" value={phone} onChange={setPhone} type="tel" />
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                >
                  {saving ? "Saving…" : "Save changes"}
                </button>
              </form>
            </section>

            <section className="rounded-3xl border border-border bg-card p-6">
              <h2 className="font-display text-lg font-semibold">Email</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Changing your email sends a confirmation link to the new address.
              </p>
              <div className="mt-4 space-y-4">
                <Field label="Email" value={email} onChange={setEmail} type="email" />
                <button
                  type="button"
                  onClick={changeEmail}
                  disabled={saving || email === user?.email}
                  className="rounded-full border border-input px-5 py-2.5 text-sm font-semibold disabled:opacity-60"
                >
                  Update email
                </button>
              </div>
            </section>

            <section className="rounded-3xl border border-border bg-card p-6">
              <h2 className="font-display text-lg font-semibold">Change password</h2>
              <form onSubmit={changePassword} className="mt-4 space-y-4">
                <Field
                  label="New password"
                  value={newPassword}
                  onChange={setNewPassword}
                  type="password"
                />
                <Field
                  label="Confirm new password"
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  type="password"
                />
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                >
                  {saving ? "Saving…" : "Update password"}
                </button>
              </form>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div>
      <label className="text-sm font-medium">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
      />
    </div>
  );
}
