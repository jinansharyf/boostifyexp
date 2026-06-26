import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/app-supabase/client";
import { Wordmark } from "@/components/site/public-shell";
import { createUser, listUsers, setPermissions } from "@/lib/admin-users.functions";
import { toast } from "sonner";

const ALL_PERMISSIONS = [
  "manage_orders",
  "manage_menu",
  "manage_users",
  "manage_settings",
  "manage_vendors",
  "manage_zones",
  "view_reports",
  "manage_chat",
] as const;

type Permission = (typeof ALL_PERMISSIONS)[number];
type Role = "customer" | "vendor" | "admin" | "super_admin";

export const Route = createFileRoute("/_authenticated/admin/users")({
  beforeLoad: async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) throw redirect({ to: "/auth" });
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", u.user.id);
    const list = (roles ?? []).map((r) => r.role);
    const isAdmin = list.includes("admin") || list.includes("super_admin");
    if (!isAdmin) throw redirect({ to: "/customer" });
  },
  component: AdminUsers,
});

function AdminUsers() {
  const qc = useQueryClient();
  const list = useServerFn(listUsers);
  const create = useServerFn(createUser);
  const setPerms = useServerFn(setPermissions);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => list(),
  });

  const createMut = useMutation({
    mutationFn: (input: any) => create({ data: input }),
    onSuccess: (res) => {
      toast.success(`Created. Temp password: ${res.temporary_password}`, { duration: 15000 });
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const permsMut = useMutation({
    mutationFn: (input: { user_id: string; permissions: Permission[] }) => setPerms({ data: input }),
    onSuccess: () => {
      toast.success("Permissions updated");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Wordmark />
          <Link to="/admin" className="text-sm text-muted-foreground">← Back to admin</Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-8 px-4 py-10">
        <div>
          <h1 className="font-display text-3xl font-bold">Users & permissions</h1>
          <p className="mt-2 text-muted-foreground">Create users with a temporary password and assign per-feature permissions.</p>
        </div>

        <CreateUserCard onSubmit={(input) => createMut.mutate(input)} pending={createMut.isPending} />

        <section className="rounded-3xl border border-border bg-card p-6">
          <h2 className="font-display text-xl font-semibold">All users</h2>
          {isLoading && <p className="mt-4 text-sm text-muted-foreground">Loading…</p>}
          <div className="mt-4 space-y-4">
            {(data ?? []).map((u) => (
              <UserRow
                key={u.id}
                user={u}
                onSavePerms={(perms) => permsMut.mutate({ user_id: u.id, permissions: perms })}
                pending={permsMut.isPending}
              />
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

function CreateUserCard({ onSubmit, pending }: { onSubmit: (i: any) => void; pending: boolean }) {
  const [form, setForm] = useState({
    email: "",
    password: "",
    full_name: "",
    role: "vendor" as Role,
    permissions: [] as Permission[],
  });

  const togglePerm = (p: Permission) =>
    setForm((f) => ({
      ...f,
      permissions: f.permissions.includes(p)
        ? f.permissions.filter((x) => x !== p)
        : [...f.permissions, p],
    }));

  const randomize = () => {
    const pw = Math.random().toString(36).slice(2, 6) + "-" + Math.random().toString(36).slice(2, 6);
    setForm((f) => ({ ...f, password: pw }));
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit(form);
  };

  return (
    <form onSubmit={submit} className="space-y-4 rounded-3xl border border-border bg-card p-6">
      <h2 className="font-display text-xl font-semibold">Add a user</h2>
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
          <p className="mt-1 text-xs text-muted-foreground">User will be required to change it on first login.</p>
        </div>
        <div>
          <label className="text-sm font-medium">Role</label>
          <select
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
            className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm"
          >
            <option value="customer">Customer</option>
            <option value="vendor">Vendor</option>
            <option value="admin">Admin</option>
            <option value="super_admin">Super admin</option>
          </select>
        </div>
      </div>

      <div>
        <p className="text-sm font-medium">Permissions</p>
        <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
          {ALL_PERMISSIONS.map((p) => (
            <label key={p} className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-xs">
              <input type="checkbox" checked={form.permissions.includes(p)} onChange={() => togglePerm(p)} />
              {p}
            </label>
          ))}
        </div>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
      >
        {pending ? "Creating..." : "Create user"}
      </button>
    </form>
  );
}

function UserRow({
  user,
  onSavePerms,
  pending,
}: {
  user: { id: string; email: string; full_name: string | null; roles: string[]; permissions: string[]; must_change_password: boolean };
  onSavePerms: (perms: Permission[]) => void;
  pending: boolean;
}) {
  const [perms, setPerms] = useState<Permission[]>(user.permissions as Permission[]);
  const dirty = perms.sort().join() !== (user.permissions as Permission[]).sort().join();

  return (
    <div className="rounded-2xl border border-border bg-background p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold">{user.full_name ?? user.email}</p>
          <p className="text-xs text-muted-foreground">{user.email}</p>
        </div>
        <div className="flex flex-wrap gap-1">
          {user.roles.map((r) => (
            <span key={r} className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">{r}</span>
          ))}
          {user.must_change_password && (
            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-700">needs password change</span>
          )}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
        {ALL_PERMISSIONS.map((p) => (
          <label key={p} className="flex items-center gap-2 rounded-lg border border-border px-2 py-1 text-xs">
            <input
              type="checkbox"
              checked={perms.includes(p)}
              onChange={() =>
                setPerms((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]))
              }
            />
            {p}
          </label>
        ))}
      </div>
      {dirty && (
        <button
          onClick={() => onSavePerms(perms)}
          disabled={pending}
          className="mt-3 rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground"
        >
          Save permissions
        </button>
      )}
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
