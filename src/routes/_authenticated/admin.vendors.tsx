import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/app-supabase/client";
import { Wordmark } from "@/components/site/public-shell";
import { toast } from "sonner";
import { Ban, CheckCircle2, MessageCircle, Pencil, PowerOff, Trash2, Store } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/vendors")({
  beforeLoad: async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) throw redirect({ to: "/auth" });
    const { data: ok } = await supabase.rpc("is_admin", { _user_id: u.user.id });
    if (!ok) throw redirect({ to: "/" });
  },
  component: AdminVendors,
});

type Vendor = {
  id: string;
  store_name: string;
  cuisine: string | null;
  phone: string | null;
  address: string | null;
  logo_url: string | null;
  status: "pending" | "approved" | "rejected" | "suspended";
  is_open: boolean;
  created_at: string;
  owner: {
    full_name: string | null;
    phone: string | null;
    email: string | null;
    avatar_url: string | null;
  } | null;
};

const STATUS_STYLES: Record<Vendor["status"], string> = {
  approved: "bg-emerald-100 text-emerald-800",
  pending: "bg-amber-100 text-amber-800",
  rejected: "bg-red-100 text-red-800",
  suspended: "bg-zinc-200 text-zinc-800",
};

function AdminVendors() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"all" | Vendor["status"]>("all");
  const [editing, setEditing] = useState<Vendor | null>(null);

  const { data: vendors = [], isLoading } = useQuery({
    queryKey: ["admin-vendors"],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("vendors")
        .select("id, owner_id, store_name, cuisine, phone, address, logo_url, status, is_open, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const ownerIds = Array.from(new Set((rows ?? []).map((r: any) => r.owner_id).filter(Boolean)));
      let profileMap: Record<string, Vendor["owner"]> = {};
      if (ownerIds.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, full_name, phone, email, avatar_url")
          .in("id", ownerIds);
        for (const p of profs ?? []) {
          profileMap[(p as any).id] = {
            full_name: (p as any).full_name,
            phone: (p as any).phone,
            email: (p as any).email,
            avatar_url: (p as any).avatar_url,
          };
        }
      }
      return (rows ?? []).map((r: any) => ({ ...r, owner: profileMap[r.owner_id] ?? null })) as Vendor[];
    },
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: Vendor["status"] }) => {
      const { error } = await supabase.from("vendors").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, v) => {
      toast.success(`Vendor ${v.status}`);
      qc.invalidateQueries({ queryKey: ["admin-vendors"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("vendors").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Vendor deleted");
      qc.invalidateQueries({ queryKey: ["admin-vendors"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const visible = vendors.filter((v) => filter === "all" || v.status === filter);
  const counts = {
    all: vendors.length,
    approved: vendors.filter((v) => v.status === "approved").length,
    suspended: vendors.filter((v) => v.status === "suspended").length,
    pending: vendors.filter((v) => v.status === "pending").length,
    rejected: vendors.filter((v) => v.status === "rejected").length,
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Wordmark />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold">Vendors</h1>
            <p className="mt-1 text-muted-foreground">
              Manage active vendors — edit details, suspend, reactivate or delete.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(["all", "approved", "suspended", "pending", "rejected"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-full border px-4 py-1.5 text-xs font-semibold capitalize transition ${
                  filter === f
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-foreground hover:border-primary"
                }`}
              >
                {f} ({counts[f]})
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : visible.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border bg-card p-12 text-center">
            <p className="font-display text-lg">No vendors</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {visible.map((v) => (
              <article key={v.id} className="rounded-3xl border border-border bg-card p-5">
                <div className="flex flex-wrap items-start gap-4">
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-2xl border border-border bg-muted flex items-center justify-center">
                    {v.logo_url ? (
                      <img src={v.logo_url} alt={v.store_name} className="h-full w-full object-cover" />
                    ) : (
                      <Store className="h-6 w-6 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-display text-lg font-semibold">{v.store_name}</h3>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${STATUS_STYLES[v.status]}`}>
                        {v.status}
                      </span>
                      {!v.is_open && v.status === "approved" && (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                          Closed
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {v.cuisine ?? "—"} • {v.phone ?? "no phone"} • {v.address ?? "no address"}
                    </p>
                    <div className="mt-2 flex items-center gap-2 rounded-2xl border border-border bg-muted/40 px-2.5 py-1.5">
                      <div className="h-7 w-7 shrink-0 overflow-hidden rounded-full border border-border bg-background flex items-center justify-center text-[10px] font-semibold text-muted-foreground">
                        {v.owner?.avatar_url ? (
                          <img src={v.owner.avatar_url} alt={v.owner.full_name ?? "Owner"} className="h-full w-full object-cover" />
                        ) : (
                          (v.owner?.full_name ?? v.owner?.email ?? "?").slice(0, 1).toUpperCase()
                        )}
                      </div>
                      <div className="min-w-0 text-xs">
                        <span className="font-medium text-foreground">{v.owner?.full_name ?? "Unnamed owner"}</span>
                        <span className="text-muted-foreground"> · {v.owner?.phone ?? "no mobile"} · {v.owner?.email ?? "—"}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setEditing(v)}
                      className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-semibold hover:border-primary"
                    >
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </button>
                    <Link
                      to="/messages"
                      search={{ vendor: v.id }}
                      className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20"
                    >
                      <MessageCircle className="h-3.5 w-3.5" /> Chat
                    </Link>
                    {v.status === "approved" ? (
                      <button
                        onClick={() => setStatus.mutate({ id: v.id, status: "suspended" })}
                        disabled={setStatus.isPending}
                        className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100"
                      >
                        <PowerOff className="h-3.5 w-3.5" /> Suspend
                      </button>
                    ) : v.status === "suspended" || v.status === "rejected" ? (
                      <button
                        onClick={() => setStatus.mutate({ id: v.id, status: "approved" })}
                        disabled={setStatus.isPending}
                        className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" /> Reactivate
                      </button>
                    ) : null}
                    {v.status !== "rejected" && v.status !== "suspended" && (
                      <button
                        onClick={() => setStatus.mutate({ id: v.id, status: "rejected" })}
                        disabled={setStatus.isPending}
                        className="inline-flex items-center gap-1 rounded-full border border-red-500/40 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-800 hover:bg-red-100"
                      >
                        <Ban className="h-3.5 w-3.5" /> Block
                      </button>
                    )}
                    <button
                      onClick={() => {
                        if (confirm(`Delete "${v.store_name}"? This removes the storefront permanently.`)) {
                          remove.mutate(v.id);
                        }
                      }}
                      disabled={remove.isPending}
                      className="inline-flex items-center gap-1 rounded-full bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>

      {editing && (
        <EditModal
          vendor={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            qc.invalidateQueries({ queryKey: ["admin-vendors"] });
          }}
        />
      )}
    </div>
  );
}

function EditModal({
  vendor,
  onClose,
  onSaved,
}: {
  vendor: Vendor;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    store_name: vendor.store_name,
    cuisine: vendor.cuisine ?? "",
    phone: vendor.phone ?? "",
    address: vendor.address ?? "",
    is_open: vendor.is_open,
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("vendors")
        .update({
          store_name: form.store_name,
          cuisine: form.cuisine || null,
          phone: form.phone || null,
          address: form.address || null,
          is_open: form.is_open,
        })
        .eq("id", vendor.id);
      if (error) throw error;
      toast.success("Vendor updated");
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/50 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg space-y-4 rounded-3xl border border-border bg-card p-6"
      >
        <div>
          <h2 className="font-display text-xl font-bold">Edit vendor</h2>
          <p className="text-sm text-muted-foreground">Update storefront details.</p>
        </div>
        <Field label="Store name" value={form.store_name} onChange={(v) => setForm({ ...form, store_name: v })} />
        <Field label="Cuisine" value={form.cuisine} onChange={(v) => setForm({ ...form, cuisine: v })} />
        <Field label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
        <Field label="Address" value={form.address} onChange={(v) => setForm({ ...form, address: v })} />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.is_open}
            onChange={(e) => setForm({ ...form, is_open: e.target.checked })}
          />
          Accepting orders
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="rounded-full border border-border px-4 py-2 text-sm font-semibold">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-sm font-medium">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
      />
    </div>
  );
}