import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/app-supabase/client";
import { Wordmark } from "@/components/site/public-shell";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { getEmailSettings, saveEmailSettings, sendTestEmail } from "@/lib/email.functions";
import { getTelegramSettings, saveTelegramSettings, sendTelegramTest } from "@/lib/telegram.functions";
import { getSmsSettings, saveSmsSettings, sendTestSms } from "@/lib/sms.functions";

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
  background_color: string | null;
  foreground_color: string | null;
  card_color: string | null;
  muted_color: string | null;
  border_color: string | null;
  theme_mode: "light" | "dark";
  order_no_prefix: string | null;
  public_url: string | null;
};

type Preset = {
  name: string;
  mode: "light" | "dark";
  primary: string;
  accent: string;
  background: string;
  foreground: string;
  card: string;
  muted: string;
  border: string;
};

const COLOR_PRESETS: Preset[] = [
  { name: "Boostify (default)", mode: "light", primary: "#5b189a", accent: "#c084fc", background: "#fafbff", foreground: "#0d1b2a", card: "#ffffff", muted: "#f1f2f7", border: "#e5e7eb" },
  { name: "Midnight Indigo", mode: "dark", primary: "#4f46e5", accent: "#818cf8", background: "#0a0a1a", foreground: "#f5f5ff", card: "#141432", muted: "#1e1e3f", border: "#2a2a55" },
  { name: "Noir & Gold", mode: "dark", primary: "#c9a84c", accent: "#f0d78c", background: "#0d0d0d", foreground: "#f5f0e0", card: "#1a1a1a", muted: "#2a2a2a", border: "#3a3a3a" },
  { name: "Ocean Deep", mode: "light", primary: "#1a4a6e", accent: "#2d8a9e", background: "#f0f7fb", foreground: "#0c2340", card: "#ffffff", muted: "#e3edf3", border: "#cfdde8" },
  { name: "Emerald Prestige", mode: "light", primary: "#0d7a5f", accent: "#c9a84c", background: "#f5f0e0", foreground: "#064e3b", card: "#ffffff", muted: "#eae4d0", border: "#d6cfb6" },
  { name: "Sunset Blaze", mode: "light", primary: "#e84393", accent: "#f7931e", background: "#fff6ee", foreground: "#3d1b3a", card: "#ffffff", muted: "#ffe6d5", border: "#f5cbb0" },
  { name: "Charcoal & Ember", mode: "dark", primary: "#e85d3a", accent: "#f7a08a", background: "#1a1a1a", foreground: "#f5f5f5", card: "#2d2d2d", muted: "#3a3a3a", border: "#4a4a4a" },
  { name: "Neon Mint", mode: "dark", primary: "#2dd4a8", accent: "#73ffb8", background: "#0d1b2a", foreground: "#e8fff5", card: "#1b4332", muted: "#264d3d", border: "#356b52" },
];

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
    if (data) setForm({ ...data, theme_mode: (data as Settings).theme_mode ?? "light" });
  }, [data]);

  const save = useMutation({
    mutationFn: async (next: Settings) => {
      // Some deployments haven't run migration 0015 yet — try the full payload,
      // and if the DB rejects unknown columns, retry with the legacy subset.
      const { error } = await supabase.from("app_settings").update(next as never).eq("id", 1);
      if (!error) return;
      if (error.code === "PGRST204" || /column .* does not exist/i.test(error.message)) {
        const { theme_mode: _1, background_color: _2, foreground_color: _3, card_color: _4, muted_color: _5, border_color: _6, order_no_prefix: _7, public_url: _8, ...legacy } = next;
        const retry = await supabase.from("app_settings").update(legacy as never).eq("id", 1);
        if (retry.error) throw retry.error;
        toast.message("Saved base settings — apply migration 0015 in /admin/setup to save the extended color scheme.");
        return;
      }
      throw error;
    },
    onSuccess: () => {
      toast.success("Settings saved");
      qc.invalidateQueries({ queryKey: ["app-settings"] });
      qc.invalidateQueries({ queryKey: ["system-settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!form) return <p className="p-10 text-muted-foreground">Loading…</p>;

  const update = (k: keyof Settings) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: e.target.value });

  const applyPreset = (p: Preset) => {
    setForm({
      ...form,
      primary_color: p.primary,
      accent_color: p.accent,
      background_color: p.background,
      foreground_color: p.foreground,
      card_color: p.card,
      muted_color: p.muted,
      border_color: p.border,
      theme_mode: p.mode,
    });
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate(form);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-4">
          <Wordmark />
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
            <Field label="Heading font" value={form.heading_font} onChange={update("heading_font")} placeholder="Google Fonts family" />
            <Field label="Body font" value={form.body_font} onChange={update("body_font")} placeholder="Google Fonts family" />
          </Card>

          <section className="rounded-3xl border border-border bg-card p-6">
            <h2 className="font-display text-xl font-semibold">Color scheme</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Pick a preset or customize each color. Changes preview live on this page after saving.
            </p>

            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
              {COLOR_PRESETS.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => applyPreset(p)}
                  className="group rounded-2xl border border-border bg-background p-3 text-left transition hover:border-primary hover:shadow-md"
                >
                  <div className="flex gap-1">
                    {[p.primary, p.accent, p.background, p.foreground].map((c) => (
                      <span
                        key={c}
                        className="h-6 flex-1 rounded"
                        style={{ backgroundColor: c, boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.05)" }}
                      />
                    ))}
                  </div>
                  <p className="mt-2 text-xs font-semibold">{p.name}</p>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{p.mode}</p>
                </button>
              ))}
            </div>

            <div className="mt-6 space-y-4">
              <div>
                <label className="text-sm font-medium">Theme mode</label>
                <div className="mt-1 flex gap-2">
                  {(["light", "dark"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setForm({ ...form, theme_mode: m })}
                      className={`rounded-full border px-4 py-1.5 text-xs font-semibold ${
                        form.theme_mode === m
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background text-foreground"
                      }`}
                    >
                      {m === "light" ? "☀ Light" : "🌙 Dark"}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <ColorField label="Primary" value={form.primary_color} onChange={(v) => setForm({ ...form, primary_color: v })} />
                <ColorField label="Accent" value={form.accent_color} onChange={(v) => setForm({ ...form, accent_color: v })} />
                <ColorField label="Background" value={form.background_color ?? "#ffffff"} onChange={(v) => setForm({ ...form, background_color: v })} />
                <ColorField label="Foreground (text)" value={form.foreground_color ?? "#0d0d0d"} onChange={(v) => setForm({ ...form, foreground_color: v })} />
                <ColorField label="Card surface" value={form.card_color ?? "#ffffff"} onChange={(v) => setForm({ ...form, card_color: v })} />
                <ColorField label="Muted / secondary" value={form.muted_color ?? "#f1f2f7"} onChange={(v) => setForm({ ...form, muted_color: v })} />
                <ColorField label="Border" value={form.border_color ?? "#e5e7eb"} onChange={(v) => setForm({ ...form, border_color: v })} />
              </div>

              <div className="rounded-2xl border border-border p-4" style={{
                backgroundColor: form.background_color ?? undefined,
                color: form.foreground_color ?? undefined,
              }}>
                <p className="text-xs uppercase tracking-wide opacity-70">Preview</p>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <button type="button" className="rounded-full px-4 py-2 text-sm font-semibold" style={{ backgroundColor: form.primary_color, color: "#fff" }}>Primary button</button>
                  <button type="button" className="rounded-full px-4 py-2 text-sm font-semibold" style={{ backgroundColor: form.accent_color, color: "#111" }}>Accent</button>
                  <div className="rounded-xl px-4 py-3 text-sm" style={{ backgroundColor: form.card_color ?? undefined, border: `1px solid ${form.border_color ?? "#e5e7eb"}` }}>
                    Card surface sample
                  </div>
                </div>
              </div>
            </div>
          </section>

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
            <Field label="Business contact phone (shown on tracking page)" value={form.contact_phone ?? ""} onChange={update("contact_phone")} />
            <Field label="Instagram URL" value={form.social_instagram ?? ""} onChange={update("social_instagram")} />
            <Field label="Facebook URL" value={form.social_facebook ?? ""} onChange={update("social_facebook")} />
            <Field label="TikTok URL" value={form.social_tiktok ?? ""} onChange={update("social_tiktok")} />
          </Card>

          <Card title="Public site URL">
            <Field
              label="Public website URL"
              value={form.public_url ?? ""}
              onChange={update("public_url")}
              placeholder="https://yourdomain.com"
            />
            <p className="text-xs text-muted-foreground md:col-span-2">
              Used in tracking links sent by email and SMS. Set your real domain here — do NOT use a lovable.app URL.
            </p>
          </Card>

          <Card title="Order numbers">
            <Field
              label="Order number prefix"
              value={form.order_no_prefix ?? "DO"}
              onChange={update("order_no_prefix")}
            />
            <p className="text-xs text-muted-foreground">
              Orders are numbered <code>{(form.order_no_prefix || "DO").toUpperCase()}-MMYY-0001</code>{" "}
              (e.g. <code>{(form.order_no_prefix || "DO").toUpperCase()}-{new Date().toLocaleString("en-US", { month: "2-digit" })}{String(new Date().getFullYear()).slice(-2)}-0001</code>). Sequence resets at the start of every month.
            </p>
          </Card>

          <EmailCard />

          <TelegramCard />

          <SmsCard />

          <QuickRepliesCard />

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

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-sm font-medium">{label}</label>
      <div className="mt-1 flex items-center gap-2 rounded-xl border border-input bg-background px-2 py-1.5">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-12 cursor-pointer rounded border-0 bg-transparent p-0"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 bg-transparent px-2 py-1 text-sm font-mono outline-none"
          placeholder="#000000"
        />
      </div>
    </div>
  );
}

function EmailCard() {
  const qc = useQueryClient();
  const getFn = useServerFn(getEmailSettings);
  const saveFn = useServerFn(saveEmailSettings);
  const testFn = useServerFn(sendTestEmail);

  const { data } = useQuery({
    queryKey: ["email-settings"],
    queryFn: () => getFn(),
  });

  const [form, setForm] = useState({
    email_from: "",
    email_from_name: "",
    admin_notification_email: "",
    resend_api_key: "",
  });
  const [touchedKey, setTouchedKey] = useState(false);
  const [testTo, setTestTo] = useState("");

  useEffect(() => {
    if (data) {
      setForm({
        email_from: data.email_from,
        email_from_name: data.email_from_name,
        admin_notification_email: data.admin_notification_email,
        resend_api_key: "",
      });
      setTouchedKey(false);
    }
  }, [data]);

  const save = useMutation({
    mutationFn: async () =>
      saveFn({
        data: {
          email_from: form.email_from || null,
          email_from_name: form.email_from_name || null,
          admin_notification_email: form.admin_notification_email || null,
          ...(touchedKey ? { resend_api_key: form.resend_api_key } : {}),
        },
      }),
    onSuccess: () => {
      toast.success("Email settings saved");
      qc.invalidateQueries({ queryKey: ["email-settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const test = useMutation({
    mutationFn: () => testFn({ data: { to: testTo } }),
    onSuccess: () => toast.success(`Test email sent to ${testTo}`),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className="rounded-3xl border border-border bg-card p-6">
      <h2 className="font-display text-xl font-semibold">Email (Resend)</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Used for partner application confirmations, admin alerts, and account approval emails.
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <label className="text-sm font-medium">Resend API key</label>
          <input
            type="password"
            value={form.resend_api_key}
            onChange={(e) => {
              setForm({ ...form, resend_api_key: e.target.value });
              setTouchedKey(true);
            }}
            placeholder={
              data?.resend_api_key_set
                ? `••••••••••${data.resend_api_key_last4} — paste a new key to replace`
                : "re_xxxxxxxxxxxxxxxxxxxx"
            }
            className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm font-mono outline-none focus:border-primary"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Get a key at resend.com → API Keys. Leave blank to keep the current one.
          </p>
        </div>
        <div>
          <label className="text-sm font-medium">From email</label>
          <input
            type="email"
            value={form.email_from}
            onChange={(e) => setForm({ ...form, email_from: e.target.value })}
            placeholder="notify@yourdomain.com"
            className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
          />
          <p className="mt-1 text-xs text-muted-foreground">Must be on a domain verified in Resend.</p>
        </div>
        <div>
          <label className="text-sm font-medium">From name</label>
          <input
            type="text"
            value={form.email_from_name}
            onChange={(e) => setForm({ ...form, email_from_name: e.target.value })}
            placeholder="Boostify"
            className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
          />
        </div>
        <div className="md:col-span-2">
          <label className="text-sm font-medium">Admin notification email</label>
          <input
            type="email"
            value={form.admin_notification_email}
            onChange={(e) => setForm({ ...form, admin_notification_email: e.target.value })}
            placeholder="ops@yourdomain.com"
            className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Where to send "new partner application" alerts.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {save.isPending ? "Saving…" : "Save email settings"}
        </button>

        <div className="flex items-center gap-2">
          <input
            type="email"
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
            placeholder="you@example.com"
            className="rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <button
            type="button"
            onClick={() => test.mutate()}
            disabled={test.isPending || !testTo}
            className="rounded-full border border-border px-4 py-2 text-sm font-medium hover:bg-secondary disabled:opacity-60"
          >
            {test.isPending ? "Sending…" : "Send test"}
          </button>
        </div>
      </div>
    </section>
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
          <div className="flex items-center gap-2">
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

function QuickRepliesCard() {
  const qc = useQueryClient();
  const { data: items = [] } = useQuery({
    queryKey: ["quick-replies-admin"],
    queryFn: async () => {
      const { data, error } = await (supabase.from("quick_replies" as any) as any)
        .select("id, label, body, sort_order")
        .order("sort_order");
      if (error) return [];
      return data as { id: string; label: string; body: string; sort_order: number }[];
    },
  });
  const [label, setLabel] = useState("");
  const [body, setBody] = useState("");

  const add = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase.from("quick_replies" as any) as any)
        .insert({ label, body, sort_order: items.length });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Added");
      setLabel(""); setBody("");
      qc.invalidateQueries({ queryKey: ["quick-replies-admin"] });
      qc.invalidateQueries({ queryKey: ["quick-replies"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from("quick_replies" as any) as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quick-replies-admin"] });
      qc.invalidateQueries({ queryKey: ["quick-replies"] });
    },
  });

  return (
    <section className="rounded-3xl border border-border bg-card p-6">
      <h2 className="font-display text-xl font-semibold">Chat quick replies</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Shown to admins in the chat composer as one-tap canned responses (like Instagram quick replies).
      </p>
      <ul className="mt-4 space-y-2">
        {items.length === 0 && <li className="text-sm text-muted-foreground">No quick replies yet.</li>}
        {items.map((q) => (
          <li key={q.id} className="flex items-start justify-between gap-3 rounded-xl border border-border p-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold">{q.label}</div>
              <div className="text-xs text-muted-foreground">{q.body}</div>
            </div>
            <button
              type="button"
              onClick={() => remove.mutate(q.id)}
              className="shrink-0 text-xs text-destructive"
            >Delete</button>
          </li>
        ))}
      </ul>
      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_2fr_auto]">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Label (e.g. Greeting)"
          className="rounded-xl border border-input bg-background px-3 py-2 text-sm"
        />
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Message body"
          className="rounded-xl border border-input bg-background px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={() => add.mutate()}
          disabled={!label.trim() || !body.trim() || add.isPending}
          className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >Add</button>
      </div>
    </section>
  );
}

function TelegramCard() {
  const qc = useQueryClient();
  const getFn = useServerFn(getTelegramSettings);
  const saveFn = useServerFn(saveTelegramSettings);
  const testFn = useServerFn(sendTelegramTest);
  const { data } = useQuery({ queryKey: ["telegram-settings"], queryFn: () => getFn() });
  const [form, setForm] = useState({ enabled: false, admin_chat_id: "", broadcast_chat_ids: "", bot_token: "" });
  const [touchedToken, setTouchedToken] = useState(false);
  useEffect(() => {
    if (data) {
      setForm({ enabled: data.enabled, admin_chat_id: data.admin_chat_id, broadcast_chat_ids: (data as any).broadcast_chat_ids ?? "", bot_token: "" });
      setTouchedToken(false);
    }
  }, [data]);

  const save = useMutation({
    mutationFn: () => saveFn({ data: {
      enabled: form.enabled,
      admin_chat_id: form.admin_chat_id || null,
      broadcast_chat_ids: form.broadcast_chat_ids || null,
      ...(touchedToken ? { bot_token: form.bot_token } : {}),
    }}),
    onSuccess: () => { toast.success("Telegram settings saved"); qc.invalidateQueries({ queryKey: ["telegram-settings"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const test = useMutation({
    mutationFn: () => testFn(),
    onSuccess: () => toast.success("Test message sent to Telegram"),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className="rounded-3xl border border-border bg-card p-6">
      <h2 className="font-display text-xl font-semibold">Telegram notifications</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Get instant alerts in a Telegram group. Create a bot with @BotFather, add it to your group, then paste the bot token and the chat ID (use @userinfobot or @RawDataBot to find the chat ID).
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="flex items-center gap-2 text-sm md:col-span-2">
          <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
          Enabled
        </label>
        <div className="md:col-span-2">
          <label className="text-sm font-medium">Bot token</label>
          <input type="password" value={form.bot_token}
            onChange={(e) => { setForm({ ...form, bot_token: e.target.value }); setTouchedToken(true); }}
            placeholder={data?.bot_token_set ? `••••${data.bot_token_last4} — paste new to replace` : "123456:ABC-DEF..."}
            className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm font-mono" />
        </div>
        <div className="md:col-span-2">
          <label className="text-sm font-medium">Admin chat ID</label>
          <input value={form.admin_chat_id} onChange={(e) => setForm({ ...form, admin_chat_id: e.target.value })}
            placeholder="-1001234567890 or 123456789"
            className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm font-mono" />
        </div>
        <div className="md:col-span-2">
          <label className="text-sm font-medium">Additional groups / channels</label>
          <textarea value={form.broadcast_chat_ids} onChange={(e) => setForm({ ...form, broadcast_chat_ids: e.target.value })}
            placeholder="-1001234567890, -1009876543210&#10;Add the bot to each group first, then paste chat IDs (comma or newline separated)."
            rows={3}
            className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm font-mono" />
          <p className="mt-1 text-xs text-muted-foreground">Every new order, status change and system alert is broadcast to the admin chat + all IDs listed here.</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" onClick={() => save.mutate()} disabled={save.isPending}
          className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60">
          {save.isPending ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={() => test.mutate()} disabled={test.isPending}
          className="rounded-full border border-border px-4 py-2 text-sm font-medium hover:bg-secondary disabled:opacity-60">
          {test.isPending ? "Sending…" : "Send test"}
        </button>
      </div>
    </section>
  );
}
