import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/app-supabase/client";
import { Wordmark } from "@/components/site/public-shell";
import { toast } from "sonner";

type Settings = {
  site_name: string;
  tagline: string | null;
  logo_url: string | null;
  favicon_url: string | null;
  og_image_url: string | null;
  primary_color: string;
  accent_color: string;
  heading_font: string;
  body_font: string;
  seo_title: string | null;
  seo_description: string | null;
  seo_keywords: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  social_instagram: string | null;
  social_facebook: string | null;
  social_tiktok: string | null;
};

export const Route = createFileRoute("/_authenticated/admin/settings")({
  beforeLoad: async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) throw redirect({ to: "/auth" });
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", u.user.id);
    const list = (roles ?? []).map((r) => r.role);
    const isAdmin = list.includes("admin") || list.includes("super_admin");
    if (!isAdmin) throw redirect({ to: "/customer" });
  },
  component: AdminSettings,
});

function AdminSettings() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["app-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("app_settings").select("*").eq("id", 1).maybeSingle();
      if (error) throw error;
      return data as Settings | null;
    },
  });

  const [form, setForm] = useState<Settings | null>(null);
  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const save = useMutation({
    mutationFn: async (next: Settings) => {
      const { error } = await supabase.from("app_settings").update(next).eq("id", 1);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Settings saved");
      qc.invalidateQueries({ queryKey: ["app-settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!form) return <p className="p-10 text-muted-foreground">Loading…</p>;

  const update = (k: keyof Settings) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: e.target.value });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate(form);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-4">
          <Wordmark />
          <Link to="/admin" className="text-sm text-muted-foreground">← Back to admin</Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-8 px-4 py-10">
        <h1 className="font-display text-3xl font-bold">System settings</h1>

        <form onSubmit={submit} className="space-y-8">
          <Card title="Branding">
            <Field label="Site name" value={form.site_name} onChange={update("site_name")} required />
            <Field label="Tagline" value={form.tagline ?? ""} onChange={update("tagline")} />
            <LogoUpload
              label="Logo"
              value={form.logo_url}
              onChange={(v) => setForm({ ...form, logo_url: v })}
            />
            <LogoUpload
              label="Favicon"
              value={form.favicon_url}
              onChange={(v) => setForm({ ...form, favicon_url: v })}
            />
            <Field label="OG image URL" value={form.og_image_url ?? ""} onChange={update("og_image_url")} />
            <Field label="Primary color" type="color" value={form.primary_color} onChange={update("primary_color")} />
            <Field label="Accent color" type="color" value={form.accent_color} onChange={update("accent_color")} />
            <Field label="Heading font" value={form.heading_font} onChange={update("heading_font")} placeholder="Google Fonts family" />
            <Field label="Body font" value={form.body_font} onChange={update("body_font")} placeholder="Google Fonts family" />
          </Card>

          <Card title="SEO">
            <Field label="SEO title" value={form.seo_title ?? ""} onChange={update("seo_title")} />
            <div>
              <label className="text-sm font-medium">SEO description</label>
              <textarea
                rows={3}
                value={form.seo_description ?? ""}
                onChange={update("seo_description")}
                className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm"
              />
            </div>
            <Field label="SEO keywords" value={form.seo_keywords ?? ""} onChange={update("seo_keywords")} />
          </Card>

          <Card title="Contact & social">
            <Field label="Contact email" type="email" value={form.contact_email ?? ""} onChange={update("contact_email")} />
            <Field label="Contact phone" value={form.contact_phone ?? ""} onChange={update("contact_phone")} />
            <Field label="Instagram URL" value={form.social_instagram ?? ""} onChange={update("social_instagram")} />
            <Field label="Facebook URL" value={form.social_facebook ?? ""} onChange={update("social_facebook")} />
            <Field label="TikTok URL" value={form.social_tiktok ?? ""} onChange={update("social_tiktok")} />
          </Card>

          <button
            type="submit"
            disabled={save.isPending}
            className="rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {save.isPending ? "Saving..." : "Save settings"}
          </button>
        </form>
      </main>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-border bg-card p-6">
      <h2 className="font-display text-xl font-semibold">{title}</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-2">{children}</div>
    </section>
  );
}

function Field({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label className="text-sm font-medium">{label}</label>
      <input
        {...props}
        className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
      />
    </div>
  );
}

function LogoUpload({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null;
  onChange: (next: string | null) => void;
}) {
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 600_000) {
      toast.error("Image too large (max ~600KB). Try a smaller PNG/SVG.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => onChange(typeof reader.result === "string" ? reader.result : null);
    reader.onerror = () => toast.error("Could not read file");
    reader.readAsDataURL(file);
  };
  return (
    <div className="md:col-span-2">
      <label className="text-sm font-medium">{label}</label>
      <div className="mt-1 flex items-center gap-3 rounded-xl border border-input bg-background p-3">
        <div className="grid h-14 w-14 place-items-center overflow-hidden rounded-lg bg-secondary">
          {value ? (
            <img src={value} alt="" className="h-full w-full object-contain" />
          ) : (
            <span className="text-xs text-muted-foreground">none</span>
          )}
        </div>
        <div className="flex-1">
          <input
            type="url"
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value || null)}
            placeholder="Paste image URL or upload below"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <div className="mt-2 flex items-center gap-2">
            <label className="cursor-pointer rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-secondary">
              Upload image
              <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="hidden" onChange={onFile} />
            </label>
            {value && (
              <button
                type="button"
                onClick={() => onChange(null)}
                className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
              >
                Remove
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
