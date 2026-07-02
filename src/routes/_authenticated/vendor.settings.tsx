import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/app-supabase/client";
import { Wordmark } from "@/components/site/public-shell";
import { ImageUpload } from "@/components/site/image-upload";
import { LocationPicker } from "@/components/site/location-picker";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import {
  getMyVendorBusinessSettings,
  saveVendorBusinessSettings,
} from "@/lib/vendor-change-requests.functions";
import { listZonesAll } from "@/lib/pricing.functions";
import {
  DAY_LABELS,
  DEFAULT_HOURS,
  normalizeHours,
  type WeeklyHours,
} from "@/lib/opening-hours";

export const Route = createFileRoute("/_authenticated/vendor/settings")({
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
  latitude: number | null;
  longitude: number | null;
  zone_id: string | null;
  is_open: boolean;
  opening_hours: WeeklyHours | null;
};

function VendorSettingsPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [vendor, setVendor] = useState<VendorRow | null>(null);
  const [pending, setPending] = useState<any | null>(null);
  const loadSettings = useServerFn(getMyVendorBusinessSettings);
  const saveSettings = useServerFn(saveVendorBusinessSettings);

  const settingsQ = useQuery({
    queryKey: ["vendor-business-settings", user?.id],
    enabled: !!user,
    queryFn: () => loadSettings(),
  });

  const zonesQ = useQuery({ queryKey: ["zones-all"], queryFn: () => listZonesAll() });

  const saveMut = useMutation({
    mutationFn: (input: { vendor_id: string; is_open: boolean; opening_hours: WeeklyHours | null; changes: Record<string, unknown> }) =>
      saveSettings({ data: input }),
    onSuccess: (res) => {
      setPending(res.pending ?? pending);
      qc.invalidateQueries({ queryKey: ["vendor-business-settings"] });
      qc.invalidateQueries({ queryKey: ["vendor-self"] });
      qc.invalidateQueries({ queryKey: ["admin-vendors"] });
      qc.invalidateQueries({ queryKey: ["msg-vendors"] });
      toast.success(res.changedFields > 0 ? "Submitted for admin approval." : "Availability updated.");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  useEffect(() => {
    if (!settingsQ.data) return;
    const v = settingsQ.data.vendor as any;
    if (v) v.opening_hours = normalizeHours(v.opening_hours);
    setVendor(v as VendorRow | null);
    setPending(settingsQ.data.pending ?? null);
  }, [settingsQ.data]);

  const update = <K extends keyof VendorRow>(key: K, value: VendorRow[K]) =>
    setVendor((v) => (v ? { ...v, [key]: value } : v));

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!vendor) return;
    const changes = {
      store_name: vendor.store_name,
      description: vendor.description,
      cuisine: vendor.cuisine,
      phone: vendor.phone,
      address: vendor.address,
      logo_url: vendor.logo_url,
      cover_url: vendor.cover_url,
      latitude: vendor.latitude,
      longitude: vendor.longitude,
      zone_id: vendor.zone_id,
    };
    saveMut.mutate({
      vendor_id: vendor.id,
      is_open: vendor.is_open,
      opening_hours: vendor.opening_hours ?? null,
      changes,
    });
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
          <h1 className="font-display text-3xl font-bold">Business settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Storefront identity, contact details, and operating status.
          </p>
        </div>

        {authLoading || settingsQ.isLoading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : settingsQ.isError ? (
          <div className="rounded-3xl border border-border bg-card p-6">
            <p className="font-semibold">Could not load business settings.</p>
            <p className="mt-1 text-sm text-muted-foreground">{settingsQ.error.message}</p>
          </div>
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

            <section className="rounded-3xl border border-border bg-card p-6 space-y-3">
              <h2 className="font-display text-lg font-semibold">Pickup zone</h2>
              <p className="text-sm text-muted-foreground">
                Delivery pricing is calculated from this pickup zone to the drop-off zone. Set it once and every new order uses it automatically.
              </p>
              <select
                value={vendor.zone_id ?? ""}
                onChange={(e) => update("zone_id", e.target.value === "" ? null : e.target.value)}
                className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              >
                <option value="">— Select a zone —</option>
                {(zonesQ.data ?? []).map((z: any) => (
                  <option key={z.id} value={z.id}>{z.name}</option>
                ))}
              </select>
            </section>

            <section className="rounded-3xl border border-border bg-card p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-lg font-semibold">Business location</h2>
                  <p className="text-sm text-muted-foreground">
                    Pinpoint your storefront so partners and staff can navigate to you.
                  </p>
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
                        toast.success("Location captured");
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
                disabled={saveMut.isPending}
                className="rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                {saveMut.isPending ? "Submitting…" : "Submit for approval"}
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