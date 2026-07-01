import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/app-supabase/client";
import { Wordmark } from "@/components/site/public-shell";
import { ImageUpload } from "@/components/site/image-upload";
import { LocationPicker } from "@/components/site/location-picker";
import {
  adminGetVendorBusinessSettings,
  adminSaveVendorBusinessSettings,
} from "@/lib/vendor-change-requests.functions";

export const Route = createFileRoute("/_authenticated/admin/vendors_/$id/edit")({
  beforeLoad: async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) throw redirect({ to: "/auth" });
    const { data: ok } = await supabase.rpc("is_admin", { _user_id: u.user.id });
    if (!ok) throw redirect({ to: "/" });
  },
  component: AdminEditVendor,
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
  latitude: number | null;
  longitude: number | null;
  is_open: boolean;
};

function AdminEditVendor() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const loadFn = useServerFn(adminGetVendorBusinessSettings);
  const saveFn = useServerFn(adminSaveVendorBusinessSettings);
  const [vendor, setVendor] = useState<VendorRow | null>(null);

  const q = useQuery({
    queryKey: ["admin-vendor-edit", id],
    queryFn: () => loadFn({ data: { vendor_id: id } }),
  });

  useEffect(() => {
    if (q.data?.vendor) setVendor(q.data.vendor as unknown as VendorRow);
  }, [q.data]);

  const saveMut = useMutation({
    mutationFn: (input: { changes: Record<string, unknown>; is_open: boolean }) =>
      saveFn({ data: { vendor_id: id, ...input } }),
    onSuccess: () => {
      toast.success("Applied on behalf of owner");
      qc.invalidateQueries({ queryKey: ["admin-vendors"] });
      qc.invalidateQueries({ queryKey: ["admin-vendor-edit", id] });
      navigate({ to: "/admin/vendors" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = <K extends keyof VendorRow>(key: K, value: VendorRow[K]) =>
    setVendor((v) => (v ? { ...v, [key]: value } : v));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!vendor) return;
    saveMut.mutate({
      is_open: vendor.is_open,
      changes: {
        store_name: vendor.store_name,
        description: vendor.description,
        cuisine: vendor.cuisine,
        phone: vendor.phone,
        address: vendor.address,
        logo_url: vendor.logo_url,
        cover_url: vendor.cover_url,
        latitude: vendor.latitude,
        longitude: vendor.longitude,
      },
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4">
          <Wordmark />
        </div>
      </header>
      <main className="mx-auto max-w-3xl space-y-6 px-4 py-10">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase text-primary">
            Admin editing
            {q.data?.owner?.email && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px]">
                on behalf of {q.data.owner.full_name ?? q.data.owner.email}
              </span>
            )}
          </div>
          <h1 className="mt-1 font-display text-3xl font-bold">
            {vendor?.store_name ?? "Loading…"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Changes are applied immediately, no approval needed. The owner is emailed a diff.
          </p>
          <Link to="/admin/vendors" className="mt-2 inline-block text-xs text-primary underline">
            ← All vendors
          </Link>
        </div>

        {q.isLoading || !vendor ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : (
          <form onSubmit={submit} className="space-y-6">
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
                  className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
                />
              </div>
            </section>

            <section className="rounded-3xl border border-border bg-card p-6 space-y-4">
              <h2 className="font-display text-lg font-semibold">Contact</h2>
              <Field label="Phone" value={vendor.phone ?? ""} onChange={(v) => update("phone", v)} type="tel" />
              <Field label="Address" value={vendor.address ?? ""} onChange={(v) => update("address", v)} />
            </section>

            <section className="rounded-3xl border border-border bg-card p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-lg font-semibold">Business location</h2>
                  <p className="text-sm text-muted-foreground">Latitude & longitude of the storefront.</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (!navigator.geolocation) {
                      toast.error("Geolocation not supported");
                      return;
                    }
                    navigator.geolocation.getCurrentPosition(
                      (pos) => {
                        update("latitude", Number(pos.coords.latitude.toFixed(6)));
                        update("longitude", Number(pos.coords.longitude.toFixed(6)));
                        toast.success("Captured your location");
                      },
                      () => toast.error("Could not read location"),
                      { enableHighAccuracy: true, timeout: 10000 },
                    );
                  }}
                  className="rounded-full border border-primary/40 bg-primary/10 px-4 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20"
                >
                  📍 Use current location
                </button>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <Field
                  label="Latitude"
                  value={vendor.latitude?.toString() ?? ""}
                  onChange={(v) => update("latitude", v.trim() === "" ? null : Number(v))}
                  type="number"
                />
                <Field
                  label="Longitude"
                  value={vendor.longitude?.toString() ?? ""}
                  onChange={(v) => update("longitude", v.trim() === "" ? null : Number(v))}
                  type="number"
                />
              </div>
              <LocationPicker
                latitude={vendor.latitude}
                longitude={vendor.longitude}
                onChange={(lat, lng) => {
                  update("latitude", lat);
                  update("longitude", lng);
                }}
              />
              {vendor.latitude != null && vendor.longitude != null && (
                <a
                  href={`https://www.google.com/maps?q=${vendor.latitude},${vendor.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block text-xs font-semibold text-primary underline"
                >
                  Open on Google Maps →
                </a>
              )}
            </section>

            <section className="rounded-3xl border border-border bg-card p-6">
              <label className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-display text-lg font-semibold">Accepting orders</p>
                  <p className="text-sm text-muted-foreground">Toggle off to pause the storefront.</p>
                </div>
                <input
                  type="checkbox"
                  checked={vendor.is_open}
                  onChange={(e) => update("is_open", e.target.checked)}
                  className="h-5 w-10 cursor-pointer appearance-none rounded-full bg-muted transition-colors checked:bg-primary relative after:content-[''] after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-transform checked:after:translate-x-5"
                />
              </label>
            </section>

            <div className="flex justify-end gap-2">
              <Link
                to="/admin/vendors"
                className="rounded-full border border-border px-5 py-2.5 text-sm font-semibold"
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled={saveMut.isPending}
                className="rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                {saveMut.isPending ? "Saving…" : "Apply changes"}
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