import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { listOrderFields, upsertOrderField, deleteOrderField } from "@/lib/order-form-fields.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/admin/order-fields")({
  component: AdminOrderFields,
});

const SECTIONS = ["customer", "delivery", "other"] as const;
const TYPES = ["text", "textarea", "number", "select"] as const;
type F = {
  id?: string;
  section: (typeof SECTIONS)[number];
  label: string;
  field_key: string;
  field_type: (typeof TYPES)[number];
  options: string[];
  required: boolean;
  active: boolean;
  sort_order: number;
};
const EMPTY: F = { section: "customer", label: "", field_key: "", field_type: "text", options: [], required: false, active: true, sort_order: 0 };

function AdminOrderFields() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const list = useServerFn(listOrderFields);
  const upsert = useServerFn(upsertOrderField);
  const del = useServerFn(deleteOrderField);
  const q = useQuery({ queryKey: ["order-fields"], queryFn: () => list() });
  const [editing, setEditing] = useState<F | null>(null);
  const [optionsText, setOptionsText] = useState("");

  const m = useMutation({
    mutationFn: (f: F) => upsert({ data: f }),
    onSuccess: () => {
      toast.success("Saved");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["order-fields"] });
      qc.invalidateQueries({ queryKey: ["order-fields-active"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  const dm = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["order-fields"] });
      qc.invalidateQueries({ queryKey: ["order-fields-active"] });
    },
  });

  const grouped = useMemo(() => {
    const g: Record<string, any[]> = { customer: [], delivery: [], other: [] };
    for (const r of (q.data ?? []) as any[]) g[r.section]?.push(r);
    return g;
  }, [q.data]);

  const openEdit = (f: F | null) => {
    setEditing(f ?? { ...EMPTY });
    setOptionsText(((f?.options ?? []) as string[]).join("\n"));
  };

  const save = () => {
    if (!editing) return;
    const f: F = { ...editing, options: editing.field_type === "select" ? optionsText.split("\n").map((s) => s.trim()).filter(Boolean) : [] };
    if (!f.label.trim() || !f.field_key.trim()) { toast.error("Label and key required"); return; }
    m.mutate(f);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex h-14 max-w-4xl items-center gap-3 px-4">
          <button onClick={() => nav({ to: "/admin" })} className="rounded-full border px-3 py-1.5 text-xs"><ArrowLeft className="mr-1 inline h-3 w-3" /> Back</button>
          <h1 className="font-display text-lg font-bold">Order form fields</h1>
          <div className="ml-auto"><Button size="sm" onClick={() => openEdit(null)}><Plus className="mr-1 h-3 w-3" /> New field</Button></div>
        </div>
      </header>
      <main className="mx-auto max-w-4xl space-y-6 px-4 py-6">
        <p className="text-sm text-muted-foreground">Fields are shown to partners in the “New order” dialog, grouped by section.</p>
        {SECTIONS.map((s) => (
          <section key={s}>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{s}</h2>
            <div className="divide-y rounded-xl border bg-card">
              {(grouped[s] ?? []).length === 0 && <div className="p-4 text-sm text-muted-foreground">No custom fields.</div>}
              {(grouped[s] ?? []).map((f: any) => (
                <div key={f.id} className="flex flex-wrap items-center gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{f.label} <span className="text-xs font-normal text-muted-foreground">({f.field_type})</span></p>
                    <p className="truncate text-xs text-muted-foreground">key: {f.field_key} · {f.required ? "required" : "optional"} · {f.active ? "active" : "hidden"}</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => openEdit(f)}>Edit</Button>
                  <Button variant="ghost" size="sm" onClick={() => dm.mutate(f.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
            </div>
          </section>
        ))}
      </main>

      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader><DialogTitle>{editing?.id ? "Edit field" : "New field"}</DialogTitle></DialogHeader>
          {editing && (
            <div className="grid gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Section</Label>
                  <Select value={editing.section} onValueChange={(v) => setEditing({ ...editing, section: v as any })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{SECTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Type</Label>
                  <Select value={editing.field_type} onValueChange={(v) => setEditing({ ...editing, field_type: v as any })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{TYPES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label>Label</Label><Input value={editing.label} onChange={(e) => setEditing({ ...editing, label: e.target.value })} /></div>
              <div><Label>Key (a-z, 0-9, _)</Label><Input value={editing.field_key} onChange={(e) => setEditing({ ...editing, field_key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })} /></div>
              {editing.field_type === "select" && (
                <div>
                  <Label>Options (one per line)</Label>
                  <textarea className="mt-1 w-full rounded-md border bg-background p-2 text-sm" rows={4} value={optionsText} onChange={(e) => setOptionsText(e.target.value)} />
                </div>
              )}
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm"><Switch checked={editing.required} onCheckedChange={(v) => setEditing({ ...editing, required: v })} /> Required</label>
                <label className="flex items-center gap-2 text-sm"><Switch checked={editing.active} onCheckedChange={(v) => setEditing({ ...editing, active: v })} /> Active</label>
                <div className="ml-auto w-24"><Label className="text-xs">Sort</Label><Input type="number" value={editing.sort_order} onChange={(e) => setEditing({ ...editing, sort_order: Number(e.target.value) || 0 })} /></div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save} disabled={m.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
