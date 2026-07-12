import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/app-supabase/client";
import { Wordmark } from "@/components/site/public-shell";
import { listZonesAll } from "@/lib/pricing.functions";
import {
  createStaff,
  listStaff,
  removeStaff,
  updateStaff,
} from "@/lib/staff.functions";

export const Route = createFileRoute("/_authenticated/admin/staff")({
  beforeLoad: async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", u.user.id);
    const list = (roles ?? []).map((r) => r.role);
    if (!list.includes("admin") && !list.includes("super_admin")) {
      throw new Error("Forbidden");
    }
  },
  component: StaffPage,
});

type Role = "manager" | "supervisor" | "officer";

function StaffPage() {
  const qc = useQueryClient();
  const list = useServerFn(listStaff);
  const create = useServerFn(createStaff);
  const update = useServerFn(updateStaff);
  const remove = useServerFn(removeStaff);
  const zonesFn = useServerFn(listZonesAll);

  const zones = useQuery({ queryKey: ["zones-all"], queryFn: () => zonesFn() });
  const staff = useQuery({ queryKey: ["staff-list"], queryFn: () => list() });

  const createMut = useMutation({
    mutationFn: (input: any) => create({ data: input }),
    onSuccess: (r) => {
      toast.success(`Created. Temp password: ${r.temporary_password}`, { duration: 15000 });
      qc.invalidateQueries({ queryKey: ["staff-list"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: (input: any) => update({ data: input }),
    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["staff-list"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeMut = useMutation({
    mutationFn: (user_id: string) => remove({ data: { user_id } }),
    onSuccess: () => {
      toast.success("Removed");
      qc.invalidateQueries({ queryKey: ["staff-list"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Wordmark />
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-8 px-4 py-10">
        <div>
          <h1 className="font-display text-3xl font-bold">Delivery staff</h1>
          <p className="mt-2 text-muted-foreground">
            Add managers, supervisors and officers. Assign the zones they can see and act on.
          </p>
        </div>

        <NewStaffCard
          zones={zones.data ?? []}
          onSubmit={(input) => createMut.mutate(input)}
          pending={createMut.isPending}
        />

        <section className="rounded-3xl border border-border bg-card p-6">
          <h2 className="font-display text-xl font-semibold">Staff members</h2>
          {staff.isLoading && <p className="mt-4 text-sm text-muted-foreground">Loading…</p>}
          <div className="mt-4 space-y-4">
            {(staff.data ?? []).map((s: any) => (
              <StaffRow
                key={s.user_id}
                s={s}
                zones={zones.data ?? []}
                onSave={(zone_ids, role, telegram_chat_id) =>
                  updateMut.mutate({
                    user_id: s.user_id,
                    staff_role: role,
                    zone_ids,
                    telegram_chat_id,
                  })
                }
                onRemove={() => {
                  if (confirm(`Remove ${s.email ?? s.user_id} from staff?`)) removeMut.mutate(s.user_id);
                }}
                pending={updateMut.isPending || removeMut.isPending}
                onToggleShift={(v) => updateMut.mutate({ user_id: s.user_id, zone_ids: s.zone_ids, on_shift: v })}
                onSaveEmail={(email, enabled) =>
                  updateMut.mutate({
                    user_id: s.user_id,
                    zone_ids: s.zone_ids,
                    notification_email: email,
                    email_notifications_enabled: enabled,
                  })
                }
              />
            ))}
            {(staff.data ?? []).length === 0 && !staff.isLoading && (
              <p className="text-sm text-muted-foreground">No staff yet.</p>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

function NewStaffCard({
  zones,
  onSubmit,
  pending,
}: {
  zones: any[];
  onSubmit: (input: any) => void;
  pending: boolean;
}) {
  const [form, setForm] = useState({
    email: "",
    password: "",
    full_name: "",
    staff_role: "officer" as Role,
    zone_ids: [] as string[],
    telegram_chat_id: "",
  });

  const randomize = () => {
    const pw = Math.random().toString(36).slice(2, 6) + "-" + Math.random().toString(36).slice(2, 6);
    setForm((f) => ({ ...f, password: pw }));
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (form.zone_ids.length === 0) {
      toast.error("Pick at least one zone");
      return;
    }
    onSubmit({ ...form, telegram_chat_id: form.telegram_chat_id.trim() || null });
  };

  const toggleZone = (id: string) =>
    setForm((f) => ({
      ...f,
      zone_ids: f.zone_ids.includes(id) ? f.zone_ids.filter((x) => x !== id) : [...f.zone_ids, id],
    }));

  return (
    <form onSubmit={submit} className="space-y-4 rounded-3xl border border-border bg-card p-6">
      <h2 className="font-display text-xl font-semibold">Add staff</h2>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Full name" required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
        <Field label="Email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <div>
          <label className="text-sm font-medium">Temporary password</label>
          <div className="mt-1 flex gap-2">
            <input
              type="text"
              required
              minLength={8}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="flex-1 rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
            <button type="button" onClick={randomize} className="rounded-xl border border-border px-3 text-xs">
              Random
            </button>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Ignored if this email already has an account.</p>
        </div>
        <div>
          <label className="text-sm font-medium">Role</label>
          <select
            value={form.staff_role}
            onChange={(e) => setForm({ ...form, staff_role: e.target.value as Role })}
            className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm"
          >
            <option value="manager">Manager</option>
            <option value="supervisor">Supervisor</option>
            <option value="officer">Officer</option>
          </select>
        </div>
        <Field
          label="Telegram chat ID (optional)"
          placeholder="e.g. 123456789"
          value={form.telegram_chat_id}
          onChange={(e) => setForm({ ...form, telegram_chat_id: e.target.value })}
        />
      </div>
      <div>
        <p className="text-sm font-medium">Zones they can see</p>
        <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
          {zones.map((z: any) => (
            <label key={z.id} className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-xs">
              <input type="checkbox" checked={form.zone_ids.includes(z.id)} onChange={() => toggleZone(z.id)} />
              {z.name}
            </label>
          ))}
          {zones.length === 0 && (
            <p className="col-span-full text-xs text-muted-foreground">
              No zones configured yet. Add zones in <Link to="/admin/pricing" className="underline">Pricing</Link>.
            </p>
          )}
        </div>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
      >
        {pending ? "Creating..." : "Create staff"}
      </button>
    </form>
  );
}

function StaffRow({
  s,
  zones,
  onSave,
  onRemove,
  pending,
  onToggleShift,
  onSaveEmail,
}: {
  s: any;
  zones: any[];
  onSave: (zone_ids: string[], role: Role, telegram_chat_id: string | null) => void;
  onRemove: () => void;
  pending: boolean;
  onToggleShift: (v: boolean) => void;
  onSaveEmail: (email: string | null, enabled: boolean) => void;
}) {
  const [ids, setIds] = useState<string[]>(s.zone_ids);
  const [role, setRole] = useState<Role>(s.staff_role);
  const [tg, setTg] = useState<string>(s.telegram_chat_id ?? "");
  const [email, setEmail] = useState<string>(s.notification_email ?? "");
  const [emailOn, setEmailOn] = useState<boolean>(s.email_notifications_enabled !== false);
  const dirty =
    role !== s.staff_role ||
    (tg || "") !== (s.telegram_chat_id ?? "") ||
    [...ids].sort().join() !== [...s.zone_ids].sort().join();
  const emailDirty = (email || "") !== (s.notification_email ?? "") || emailOn !== (s.email_notifications_enabled !== false);

  const toggle = (id: string) =>
    setIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  return (
    <div className="rounded-2xl border border-border bg-background p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold">{s.full_name ?? s.email ?? s.user_id}</p>
          <p className="text-xs text-muted-foreground">{s.email}</p>
        </div>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
          className="rounded-xl border border-border bg-background px-3 py-1.5 text-xs"
        >
          <option value="manager">Manager</option>
          <option value="supervisor">Supervisor</option>
          <option value="officer">Officer</option>
        </select>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
        {zones.map((z: any) => (
          <label key={z.id} className="flex items-center gap-2 rounded-lg border border-border px-2 py-1 text-xs">
            <input type="checkbox" checked={ids.includes(z.id)} onChange={() => toggle(z.id)} />
            {z.name}
          </label>
        ))}
      </div>
      <div className="mt-3">
        <label className="text-xs font-medium text-muted-foreground">Telegram chat ID</label>
        <input
          value={tg}
          onChange={(e) => setTg(e.target.value)}
          placeholder="e.g. 123456789"
          className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-1.5 text-xs outline-none focus:border-primary"
        />
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto_auto]">
        <div>
          <label className="text-xs font-medium text-muted-foreground">Notification email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="staff@example.com (leave blank to use login email)"
            className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-1.5 text-xs outline-none focus:border-primary"
          />
        </div>
        <label className="mt-4 flex items-center gap-2 text-xs">
          <input type="checkbox" checked={emailOn} onChange={(e) => setEmailOn(e.target.checked)} />
          Email on
        </label>
        {emailDirty && (
          <button
            onClick={() => onSaveEmail(email.trim() || null, emailOn)}
            disabled={pending}
            className="mt-3 rounded-full border border-border px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
          >Save email</button>
        )}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <label className="flex items-center gap-2 text-xs font-medium">
          <input
            type="checkbox"
            checked={s.on_shift !== false}
            onChange={(e) => onToggleShift(e.target.checked)}
          />
          On shift (receive email/telegram alerts)
        </label>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {dirty && (
          <button
            onClick={() => onSave(ids, role, tg.trim() ? tg.trim() : null)}
            disabled={pending}
            className="rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
          >
            Save
          </button>
        )}
        <button
          onClick={onRemove}
          disabled={pending}
          className="rounded-full border border-destructive/40 px-4 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-60"
        >
          Remove
        </button>
      </div>
    </div>
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
