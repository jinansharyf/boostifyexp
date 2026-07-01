import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/app-supabase/client";
import { Wordmark } from "@/components/site/public-shell";
import { getLandingContent, saveLandingContent, DEFAULT_LANDING, type LandingContent } from "@/lib/landing-content.functions";

export const Route = createFileRoute("/_authenticated/admin/landing")({
  beforeLoad: async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) throw redirect({ to: "/auth" });
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", u.user.id);
    const list = (roles ?? []).map((r) => r.role);
    if (!list.includes("admin") && !list.includes("super_admin")) throw redirect({ to: "/customer" });
  },
  component: AdminLanding,
});

function AdminLanding() {
  const qc = useQueryClient();
  const get = useServerFn(getLandingContent);
  const save = useServerFn(saveLandingContent);
  const { data } = useQuery({ queryKey: ["landing-content-admin"], queryFn: () => get() });
  const [form, setForm] = useState<LandingContent>(DEFAULT_LANDING);
  useEffect(() => { if (data) setForm(data); }, [data]);

  const mut = useMutation({
    mutationFn: () => save({ data: form }),
    onSuccess: () => {
      toast.success("Landing page updated");
      qc.invalidateQueries({ queryKey: ["landing-content"] });
      qc.invalidateQueries({ queryKey: ["landing-content-admin"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updArr = <K extends "stats" | "features" | "steps">(k: K, idx: number, patch: Partial<LandingContent[K][number]>) =>
    setForm({ ...form, [k]: form[k].map((x, i) => i === idx ? { ...x, ...patch } : x) } as LandingContent);
  const addRow = (k: "stats" | "features" | "steps") => {
    if (k === "stats") setForm({ ...form, stats: [...form.stats, { k: "", v: "" }] });
    if (k === "features") setForm({ ...form, features: [...form.features, { t: "", d: "" }] });
    if (k === "steps") setForm({ ...form, steps: [...form.steps, { n: "", t: "", d: "" }] });
  };
  const delRow = (k: "stats" | "features" | "steps", idx: number) =>
    setForm({ ...form, [k]: form[k].filter((_, i) => i !== idx) } as LandingContent);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-4">
          <Wordmark />
        </div>
      </header>
      <main className="mx-auto max-w-4xl space-y-6 px-4 py-10">
        <h1 className="font-display text-3xl font-bold">Landing page content</h1>

        <section className="rounded-3xl border border-border bg-card p-6 space-y-3">
          <h2 className="font-semibold">Hero</h2>
          <Input label="Hero title (use Enter for line break; last line is highlighted)" value={form.hero_title ?? ""} onChange={(v) => setForm({ ...form, hero_title: v })} multiline />
          <Input label="Hero subtitle" value={form.hero_subtitle ?? ""} onChange={(v) => setForm({ ...form, hero_subtitle: v })} multiline />
          <Input label="Primary CTA label" value={form.hero_cta_label ?? ""} onChange={(v) => setForm({ ...form, hero_cta_label: v })} />
        </section>

        <section className="rounded-3xl border border-border bg-card p-6 space-y-3">
          <h2 className="font-semibold">Showcase heading (above features)</h2>
          <Input label="Title" value={form.showcase_title ?? ""} onChange={(v) => setForm({ ...form, showcase_title: v })} />
          <Input label="Subtitle" value={form.showcase_subtitle ?? ""} onChange={(v) => setForm({ ...form, showcase_subtitle: v })} />
        </section>

        <ListSection title="Stats (3 recommended)" rows={form.stats} fields={[{ k: "k", label: "Big text" }, { k: "v", label: "Description" }]}
          onChange={(i, p) => updArr("stats", i, p as any)} onAdd={() => addRow("stats")} onDelete={(i) => delRow("stats", i)} />

        <ListSection title="Features" rows={form.features} fields={[{ k: "t", label: "Title" }, { k: "d", label: "Description" }]}
          onChange={(i, p) => updArr("features", i, p as any)} onAdd={() => addRow("features")} onDelete={(i) => delRow("features", i)} />

        <section className="rounded-3xl border border-border bg-card p-6 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold">Partners section</h2>
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" checked={form.show_partners} onChange={(e) => setForm({ ...form, show_partners: e.target.checked })} />
              Show on landing
            </label>
          </div>
          <Input label="Section title" value={form.partners_title ?? ""} onChange={(v) => setForm({ ...form, partners_title: v })} />
          <Input label="Section subtitle" value={form.partners_subtitle ?? ""} onChange={(v) => setForm({ ...form, partners_subtitle: v })} />
          <p className="text-xs text-muted-foreground">Only approved vendors are shown. Their logo, name and address come from their business profile.</p>
        </section>

        <ListSection title="How it works" rows={form.steps} fields={[{ k: "n", label: "Number (01)" }, { k: "t", label: "Title" }, { k: "d", label: "Description" }]}
          onChange={(i, p) => updArr("steps", i, p as any)} onAdd={() => addRow("steps")} onDelete={(i) => delRow("steps", i)} />

        <section className="rounded-3xl border border-border bg-card p-6 space-y-3">
          <h2 className="font-semibold">Bottom CTA</h2>
          <Input label="Title" value={form.cta_title ?? ""} onChange={(v) => setForm({ ...form, cta_title: v })} />
          <Input label="Subtitle" value={form.cta_subtitle ?? ""} onChange={(v) => setForm({ ...form, cta_subtitle: v })} />
          <Input label="Button label" value={form.cta_label ?? ""} onChange={(v) => setForm({ ...form, cta_label: v })} />
          <Input label="Footer tagline" value={form.footer_tagline ?? ""} onChange={(v) => setForm({ ...form, footer_tagline: v })} />
        </section>

        <button onClick={() => mut.mutate()} disabled={mut.isPending}
          className="rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60">
          {mut.isPending ? "Saving…" : "Save landing page"}
        </button>
      </main>
    </div>
  );
}

function Input({ label, value, onChange, multiline }: { label: string; value: string; onChange: (v: string) => void; multiline?: boolean }) {
  return (
    <div>
      <label className="text-sm font-medium">{label}</label>
      {multiline ? (
        <textarea rows={2} value={value} onChange={(e) => onChange(e.target.value)}
          className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm" />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)}
          className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm" />
      )}
    </div>
  );
}

function ListSection({ title, rows, fields, onChange, onAdd, onDelete }: {
  title: string; rows: any[]; fields: { k: string; label: string }[];
  onChange: (i: number, patch: any) => void; onAdd: () => void; onDelete: (i: number) => void;
}) {
  return (
    <section className="rounded-3xl border border-border bg-card p-6 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">{title}</h2>
        <button onClick={onAdd} className="rounded-full border border-border px-3 py-1 text-xs">+ Add</button>
      </div>
      {rows.map((r, i) => (
        <div key={i} className="grid gap-2 rounded-xl border border-border p-3 md:grid-cols-[1fr_2fr_auto]">
          {fields.map((f) => (
            <input key={f.k} value={r[f.k] ?? ""} placeholder={f.label}
              onChange={(e) => onChange(i, { [f.k]: e.target.value })}
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm" />
          ))}
          <button onClick={() => onDelete(i)} className="text-xs text-destructive">Delete</button>
        </div>
      ))}
    </section>
  );
}