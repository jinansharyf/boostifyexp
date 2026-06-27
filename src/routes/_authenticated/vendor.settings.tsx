import { createFileRoute, Link, useNavigate, redirect } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/app-supabase/client";
import { Wordmark } from "@/components/site/public-shell";
import { ImageUpload } from "@/components/site/image-upload";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { submitVendorChangeRequest } from "@/lib/vendor-change-requests.functions";

export const Route = createFileRoute("/_authenticated/vendor/settings")({
  beforeLoad: async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) throw redirect({ to: "/auth" });
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", u.user.id);
    if (!(roles ?? []).some((r) => r.role === "vendor")) {
      throw redirect({ to: "/customer" });
    }
  },
  component: VendorSettingsPage,
});

type VendorRow = {
  id: string;
  store_name: string;
  description: string | null;
  cuisine: string | null;
  phone: string | null;
  address: string | null;
  logo_url: string | null;
  cover_url: string | null;
  is_open: boolean;
};

function VendorSettingsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [vendor, setVendor] = useState<VendorRow | null>(null);
  const [pending, setPending] = useState<any | null>(null);
  const submitChange = useServerFn(submitVendorChangeRequest);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("vendors")
      .select("id, store_name, description, cuisine, phone, address, logo_url, cover_url, is_open")
      .eq("owner_id", user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) toast.error(error.message);
        setVendor(data as VendorRow | null);
        setLoading(false);
        if (data?.id) {
          (supabase.from("vendor_change_requests" as any) as any)
            .select("*")
            .eq("vendor_id", data.id)
            .eq("status", "pending")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle()
            .then(({ data: pr }: any) => setPending(pr));
        }
      });
  }, [user]);

  const update = <K extends keyof VendorRow>(key: K, value: VendorRow[K]) =>
    setVendor((v) => (v ? { ...v, [key]: value } : v));

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!vendor) return;
    setSaving(true);
    try {
      // is_open is operational — applies instantly
      const { error: openErr } = await supabase
        .from("vendors").update({ is_open: vendor.is_open }).eq("id", vendor.id);
      if (openErr) throw openErr;

      const changes = {
        store_name: vendor.store_name,
        description: vendor.description,
        cuisine: vendor.cuisine,
        phone: vendor.phone,
        address: vendor.address,
        logo_url: vendor.logo_url,
        cover_url: vendor.cover_url,
      };
      await submitChange({ data: { vendor_id: vendor.id, changes } });
      setPending({ status: "pending", changes });
      toast.success("Submitted for admin approval.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  };

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
          <Link to="/vendor" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            ← Back to dashboard
          </Link>
          <h1 className="font-display text-3xl font-bold">Business settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Storefront identity, contact details, and operating status.
          </p>
        </div>

        {loading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : !vendor ? (
          <div className="rounded-3xl border border-border bg-card p-6">
            <p className="font-semibold">No vendor record yet.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              An admin needs to approve your partner application before you can edit a storefront.
            </p>
          </div>
        ) : (
          <form onSubmit={save} className="space-y-6">
            {pending && (
              <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
                <strong>Changes pending admin approval.</strong> Your latest edits will go live after review.
              </div>
            )}
            <section className="rounded-3xl border border-border bg-card p-6 space-y-5">
              <h2 className="font-display text-lg font-semibold">Brand</h2>
              <div>
                <label className="mb-2 block text-sm font-medium">Logo</label>
                <ImageUpload
                  bucket="vendor-assets"
                  pathPrefix={`${vendor.id}/logo`}
                  value={vendor.logo_url}
                  onChange={(url) => update("logo_url", url)}
                  label="Logo"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">Cover image</label>
                <ImageUpload
                  bucket="vendor-assets"
                  pathPrefix={`${vendor.id}/cover`}
                  value={vendor.cover_url}
                  onChange={(url) => update("cover_url", url)}
                  label="Cover"
                  shape="rect"
                  aspect="aspect-[16/9]"
                />
              </div>
            </section>

            <section className="rounded-3xl border border-border bg-card p-6 space-y-4">
              <h2 className="font-display text-lg font-semibold">Storefront</h2>
              <Field label="Store name" value={vendor.store_name} onChange={(v) => update("store_name", v)} />
              <Field label="Cuisine / category" value={vendor.cuisine ?? ""} onChange={(v) => update("cuisine", v)} />
              <div>
                <label className="text-sm font-medium">Description</label>
                <textarea
                  value={vendor.description ?? ""}
                  onChange={(e) => update("description", e.target.value)}
                  rows={4}
                  className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </section>

            <section className="rounded-3xl border border-border bg-card p-6 space-y-4">
              <h2 className="font-display text-lg font-semibold">Contact</h2>
              <Field label="Phone" value={vendor.phone ?? ""} onChange={(v) => update("phone", v)} type="tel" />
              <Field label="Address" value={vendor.address ?? ""} onChange={(v) => update("address", v)} />
            </section>

            <section className="rounded-3xl border border-border bg-card p-6">
              <label className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-display text-lg font-semibold">Accepting orders</p>
                  <p className="text-sm text-muted-foreground">Toggle off to pause your storefront.</p>
                </div>
                <input
                  type="checkbox"
                  checked={vendor.is_open}
                  onChange={(e) => update("is_open", e.target.checked)}
                  className="h-5 w-10 cursor-pointer appearance-none rounded-full bg-muted transition-colors checked:bg-primary relative after:content-[''] after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-transform checked:after:translate-x-5"
                />
              </label>
            </section>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                {saving ? "Submitting…" : "Submit for approval"}
              </button>
            </div>
          </form>
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