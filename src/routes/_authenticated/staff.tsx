import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/app-supabase/client";
import { Wordmark } from "@/components/site/public-shell";
import { listStaffOrders, staffUpdateOrderStatus } from "@/lib/staff.functions";
import { StatusBadge } from "@/components/site/order-status";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/staff")({
  component: StaffDashboard,
});

type StaffAction = "accepted" | "rejected" | "picked_up" | "delivered" | "cancelled";

function StaffDashboard() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const load = useServerFn(listStaffOrders);
  const upd = useServerFn(staffUpdateOrderStatus);

  const q = useQuery({
    queryKey: ["staff-orders"],
    queryFn: () => load({ data: {} }),
    refetchInterval: 20000,
  });

  const [notifPermission, setNotifPermission] = useState<NotificationPermission>(
    typeof Notification !== "undefined" ? Notification.permission : "denied",
  );
  const seenIds = useRef<Set<string>>(new Set());
  const primed = useRef(false);

  useEffect(() => {
    const orders = q.data?.orders ?? [];
    if (!primed.current) {
      for (const o of orders) seenIds.current.add(o.id);
      primed.current = true;
      return;
    }
    for (const o of orders) {
      if (seenIds.current.has(o.id)) continue;
      seenIds.current.add(o.id);
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        try {
          new Notification(`New order #${o.tracking_no ?? o.id.slice(0, 8)}`, {
            body: `${o.customer_name} · ${o.delivery_address}`,
            tag: `order-${o.id}`,
          });
        } catch {
          // ignore
        }
      }
    }
  }, [q.data?.orders]);

  const enableNotifications = async () => {
    if (typeof Notification === "undefined") {
      toast.error("Notifications not supported in this browser");
      return;
    }
    const res = await Notification.requestPermission();
    setNotifPermission(res);
    if (res === "granted") toast.success("Browser notifications enabled");
    else toast.error("Notifications were blocked");
  };

  const updMut = useMutation({
    mutationFn: (input: { id: string; status: StaffAction }) =>
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
          {notifPermission !== "granted" && (
            <button
              onClick={enableNotifications}
              className="mt-3 rounded-full border border-primary/40 bg-primary/10 px-4 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20"
            >
              🔔 Enable browser notifications
            </button>
          )}
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
                <StatusBadge status={o.status} />
              </div>
              {o.vendor && (
                <div className="mt-3 flex items-center gap-3 rounded-xl border border-border bg-secondary/40 p-2.5">
                  {o.vendor.logo_url ? (
                    <img
                      src={o.vendor.logo_url}
                      alt={o.vendor.store_name}
                      className="h-10 w-10 shrink-0 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">
                      {String(o.vendor.store_name ?? "?").slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{o.vendor.store_name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      Pickup: {o.vendor.address ?? "—"}
                      {o.vendor.phone ? ` · ${o.vendor.phone}` : ""}
                    </p>
                  </div>
                </div>
              )}
              <p className="mt-2 text-sm">{o.delivery_address}</p>
              {o.notes && <p className="mt-1 text-xs text-muted-foreground">{o.notes}</p>}
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-semibold">{Number(o.total ?? 0).toFixed(2)}</span>
                {canUpdate && (
                  <StaffActions
                    status={o.status}
                    disabled={updMut.isPending}
                    onAction={(next) => updMut.mutate({ id: o.id, status: next })}
                  />
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

function StaffActions({
  status,
  onAction,
  disabled,
}: {
  status: string;
  onAction: (next: StaffAction) => void;
  disabled?: boolean;
}) {
  const terminal = status === "delivered" || status === "cancelled" || status === "rejected";
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {status === "pending" && (
        <>
          <Button size="sm" className="h-8 px-3 text-xs" disabled={disabled} onClick={() => onAction("accepted")}>Approve</Button>
          <Button size="sm" variant="outline" className="h-8 px-3 text-xs" disabled={disabled} onClick={() => onAction("rejected")}>Reject</Button>
        </>
      )}
      {status === "accepted" && (
        <Button size="sm" className="h-8 px-3 text-xs" disabled={disabled} onClick={() => onAction("picked_up")}>Picked</Button>
      )}
      {(status === "picked_up" || status === "on_the_way" || status === "preparing") && (
        <Button size="sm" className="h-8 px-3 text-xs" disabled={disabled} onClick={() => onAction("delivered")}>Delivered</Button>
      )}
      {!terminal && (
        <Button size="sm" variant="destructive" className="h-8 px-3 text-xs" disabled={disabled} onClick={() => onAction("cancelled")}>Cancel</Button>
      )}
    </div>
  );
}
