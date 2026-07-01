import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/app-supabase/client";
import { Wordmark } from "@/components/site/public-shell";
import {
  listPartnerApplications,
  approvePartnerApplication,
  rejectPartnerApplication,
} from "@/lib/partner-applications.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/partners")({
  beforeLoad: async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) throw redirect({ to: "/auth" });
    const { data: ok } = await supabase.rpc("is_admin", { _user_id: u.user.id });
    if (!ok) throw redirect({ to: "/" });
  },
  component: AdminPartners,
});

type Application = {
  id: string;
  applicant_name: string;
  applicant_email: string;
  applicant_phone: string;
  store_name: string;
  cuisine: string | null;
  address: string | null;
  notes: string | null;
  status: "pending" | "approved" | "rejected";
  review_notes: string | null;
  reviewed_at: string | null;
  created_at: string;
};

function AdminPartners() {
  const qc = useQueryClient();
  const fetchList = useServerFn(listPartnerApplications);
  const approveFn = useServerFn(approvePartnerApplication);
  const rejectFn = useServerFn(rejectPartnerApplication);

  const { data: applications = [], isLoading } = useQuery({
    queryKey: ["partner-applications"],
    queryFn: () => fetchList() as Promise<Application[]>,
  });

  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("pending");
  const [credentials, setCredentials] = useState<{ email: string; password: string } | null>(null);

  const approve = useMutation({
    mutationFn: async (id: string) => {
      const password = generatePassword();
      const res = await approveFn({ data: { application_id: id, temporary_password: password } });
      return res;
    },
    onSuccess: (res) => {
      setCredentials({ email: res.email, password: res.temporary_password });
      qc.invalidateQueries({ queryKey: ["partner-applications"] });
      toast.success("Partner approved — share the credentials below");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to approve"),
  });

  const reject = useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes?: string }) =>
      rejectFn({ data: { application_id: id, review_notes: notes } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["partner-applications"] });
      toast.success("Application rejected");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to reject"),
  });

  const visible = applications.filter((a) => filter === "all" || a.status === filter);
  const counts = {
    pending: applications.filter((a) => a.status === "pending").length,
    approved: applications.filter((a) => a.status === "approved").length,
    rejected: applications.filter((a) => a.status === "rejected").length,
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
            <h1 className="font-display text-3xl font-bold">Business partners</h1>
            <p className="mt-1 text-muted-foreground">
              Review restaurant applications and approve trusted partners.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(["pending", "approved", "rejected", "all"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-full border px-4 py-1.5 text-xs font-semibold capitalize transition ${
                  filter === f
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-foreground hover:border-primary"
                }`}
              >
                {f} {f !== "all" && `(${counts[f]})`}
              </button>
            ))}
          </div>
        </div>

        {credentials && (
          <div className="mb-6 rounded-2xl border border-primary/30 bg-primary/5 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-display font-semibold">Share these credentials with the partner</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  They'll be required to set a new password on first sign in.
                </p>
                <div className="mt-3 grid gap-1.5 font-mono text-sm">
                  <div>
                    <span className="text-muted-foreground">Email: </span>
                    <strong>{credentials.email}</strong>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Password: </span>
                    <strong>{credentials.password}</strong>
                  </div>
                </div>
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(
                    `Email: ${credentials.email}\nTemporary password: ${credentials.password}\nSign in: ${window.location.origin}/auth`
                  );
                  toast.success("Copied");
                }}
                className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground"
              >
                Copy
              </button>
            </div>
            <button
              onClick={() => setCredentials(null)}
              className="mt-3 text-xs text-muted-foreground underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {isLoading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : visible.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border bg-card p-12 text-center">
            <p className="font-display text-lg">No {filter === "all" ? "" : filter} applications</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {filter === "pending"
                ? "All caught up — new applications will appear here."
                : "Nothing to show in this view."}
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            {visible.map((app) => (
              <ApplicationCard
                key={app.id}
                app={app}
                onApprove={() => approve.mutate(app.id)}
                onReject={(notes) => reject.mutate({ id: app.id, notes })}
                busy={approve.isPending || reject.isPending}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function ApplicationCard({
  app,
  onApprove,
  onReject,
  busy,
}: {
  app: Application;
  onApprove: () => void;
  onReject: (notes?: string) => void;
  busy: boolean;
}) {
  const [showReject, setShowReject] = useState(false);
  const [notes, setNotes] = useState("");
  const badge =
    app.status === "pending"
      ? "bg-amber-100 text-amber-800"
      : app.status === "approved"
      ? "bg-emerald-100 text-emerald-800"
      : "bg-red-100 text-red-800";

  return (
    <article className="rounded-3xl border border-border bg-card p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-display text-lg font-semibold">{app.store_name}</h3>
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${badge}`}>
              {app.status}
            </span>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {app.cuisine ? `${app.cuisine} • ` : ""}submitted{" "}
            {new Date(app.created_at).toLocaleString()}
          </p>
        </div>
      </div>

      <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
        <Detail label="Contact" value={app.applicant_name} />
        <Detail label="Email" value={app.applicant_email} />
        <Detail label="Phone" value={app.applicant_phone} />
        {app.address && <Detail label="Address" value={app.address} />}
        {app.notes && <Detail label="Notes" value={app.notes} className="md:col-span-2" />}
        {app.review_notes && (
          <Detail label="Review notes" value={app.review_notes} className="md:col-span-2" />
        )}
      </dl>

      {app.status === "pending" && (
        <div className="mt-5 flex flex-wrap gap-2">
          {!showReject ? (
            <>
              <button
                onClick={onApprove}
                disabled={busy}
                className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                Approve & create login
              </button>
              <button
                onClick={() => setShowReject(true)}
                disabled={busy}
                className="rounded-full border border-border px-5 py-2 text-sm font-semibold"
              >
                Reject
              </button>
            </>
          ) : (
            <div className="flex w-full flex-col gap-2 md:flex-row">
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Reason (optional, shared internally)"
                className="flex-1 rounded-xl border border-input bg-background px-3 py-2 text-sm"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => onReject(notes || undefined)}
                  disabled={busy}
                  className="rounded-full bg-red-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  Confirm reject
                </button>
                <button
                  onClick={() => setShowReject(false)}
                  className="rounded-full border border-border px-4 py-2 text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function Detail({
  label,
  value,
  className = "",
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5">{value}</dd>
    </div>
  );
}

function generatePassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  const arr = new Uint32Array(12);
  crypto.getRandomValues(arr);
  for (let i = 0; i < arr.length; i++) out += chars[arr[i] % chars.length];
  return out;
}
