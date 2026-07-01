import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/app-supabase/client";
import { Wordmark } from "@/components/site/public-shell";
import { listStaffOrders, staffUpdateOrderStatus } from "@/lib/staff.functions";

export const Route = createFileRoute("/_authenticated/staff")({
  component: StaffDashboard,
});

const STATUS_FLOW = [
  "pending",
  "accepted",
  "picked_up",
  "on_the_way",
  "delivered",
  "cancelled",
] as const;

function StaffDashboard() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const load = useServerFn(listStaffOrders);
  const upd = useServerFn(staffUpdateOrderStatus);

  const q = useQuery({
    queryKey: ["staff-orders"],
    queryFn: () => load({ data: {} }),
  });

  const updMut = useMutation({
    mutationFn: (input: { id: string; status: (typeof STATUS_FLOW)[number] }) =>
      upd({ data: input }),
    onSuccess: () => {
      toast.success("Status updated");
      qc.invalidateQueries({ queryKey: ["staff-orders"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  };

  const role = q.data?.role ?? "officer";
  const canUpdate = role === "officer" || role === "supervisor" || role === "manager";

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Wordmark />
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold uppercase text-primary">
              {role}
            </span>
            <button
              onClick={signOut}
              className="rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:bg-secondary"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        <div>
          <h1 className="font-display text-3xl font-bold">Zone orders</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Orders in the zones assigned to you.
          </p>
        </div>

        {q.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {q.error && (
          <p className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
            {(q.error as Error).message}
          </p>
        )}

        <div className="space-y-3">
          {(q.data?.orders ?? []).map((o: any) => (
            <div key={o.id} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold">#{o.tracking_no ?? o.id.slice(0, 8)}</p>
                  <p className="text-xs text-muted-foreground">
                    {o.customer_name} · {o.customer_phone}
                  </p>
                </div>
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                  {o.status}
                </span>
              </div>
              <p className="mt-2 text-sm">{o.delivery_address}</p>
              {o.notes && <p className="mt-1 text-xs text-muted-foreground">{o.notes}</p>}
              <div className="mt-3 flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">{Number(o.total ?? 0).toFixed(2)}</span>
                {canUpdate && (
                  <select
                    value={o.status}
                    onChange={(e) =>
                      updMut.mutate({ id: o.id, status: e.target.value as any })
                    }
                    className="rounded-xl border border-border bg-background px-3 py-1.5 text-xs"
                  >
                    {STATUS_FLOW.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          ))}
          {(q.data?.orders ?? []).length === 0 && !q.isLoading && (
            <p className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
              No orders in your zones yet.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
