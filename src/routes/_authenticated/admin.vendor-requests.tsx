import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/app-supabase/client";
import { Wordmark } from "@/components/site/public-shell";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import {
  listVendorChangeRequests,
  reviewVendorChangeRequest,
} from "@/lib/vendor-change-requests.functions";

export const Route = createFileRoute("/_authenticated/admin/vendor-requests")({
  beforeLoad: async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) throw redirect({ to: "/auth" });
    const { data: ok } = await supabase.rpc("is_admin", { _user_id: u.user.id });
    if (!ok) throw redirect({ to: "/" });
  },
  component: VendorRequestsPage,
});

type Req = {
  id: string;
  vendor_id: string;
  status: "pending" | "approved" | "rejected";
  changes: Record<string, any>;
  admin_note: string | null;
  created_at: string;
  vendors?: { store_name: string } | null;
};

function VendorRequestsPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listVendorChangeRequests);
  const reviewFn = useServerFn(reviewVendorChangeRequest);
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["vendor-change-requests"],
    queryFn: () => listFn() as Promise<Req[]>,
  });

  const review = useMutation({
    mutationFn: async ({ req, approve }: { req: Req; approve: boolean }) => {
      await reviewFn({ data: { request_id: req.id, approve } });
    },
    onSuccess: (_, v) => {
      toast.success(v.approve ? "Approved & applied" : "Rejected");
      qc.invalidateQueries({ queryKey: ["vendor-change-requests"] });
      qc.invalidateQueries({ queryKey: ["admin-vendors"] });
      qc.invalidateQueries({ queryKey: ["msg-vendors"] });
      qc.invalidateQueries({ queryKey: ["approved-vendors-directory"] });
      qc.invalidateQueries({ queryKey: ["vendor-dashboard"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
          <Wordmark />
          <Link to="/admin" className="text-sm text-muted-foreground">← Back to admin</Link>
        </div>
      </header>
      <main className="mx-auto max-w-5xl space-y-4 px-4 py-10">
        <h1 className="font-display text-3xl font-bold">Vendor change requests</h1>
        <p className="text-sm text-muted-foreground">Review business-info edits submitted by vendors.</p>
        {isLoading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-muted-foreground">No requests yet.</p>
        ) : (
          <ul className="space-y-3">
            {rows.map((r) => (
              <li key={r.id} className="rounded-2xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold">{r.vendors?.store_name ?? "Vendor"}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleString()} · <span className="capitalize">{r.status}</span>
                    </div>
                  </div>
                  {r.status === "pending" && (
                    <div className="flex gap-2">
                      <button
                        className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground"
                        onClick={() => review.mutate({ req: r, approve: true })}
                        disabled={review.isPending}
                      >Approve</button>
                      <button
                        className="rounded-full border border-destructive/40 px-3 py-1 text-xs text-destructive"
                        onClick={() => review.mutate({ req: r, approve: false })}
                        disabled={review.isPending}
                      >Reject</button>
                    </div>
                  )}
                </div>
                <dl className="mt-3 grid gap-1 text-sm md:grid-cols-2">
                  {Object.entries(r.changes).map(([k, v]) => (
                    <div key={k} className="flex gap-2">
                      <dt className="font-medium text-muted-foreground">{k}:</dt>
                      <dd className="truncate">{String(v ?? "—")}</dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}