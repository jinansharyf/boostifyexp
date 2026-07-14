import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { listOrders, updateOrderStatus } from "@/lib/orders.functions";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { STATUS_LABEL, STATUS_FILTERS, StatusBadge } from "@/components/site/order-status";
import { useOrderBrowserNotifications } from "@/hooks/use-order-browser-notifications";
import { useOrdersRealtime } from "@/hooks/use-orders-realtime";

export const Route = createFileRoute("/_authenticated/admin/orders")({
  component: AdminOrders,
});

function AdminOrders() {
  const qc = useQueryClient();
  useOrderBrowserNotifications("all");
  useOrdersRealtime();
  const list = useServerFn(listOrders);
  const upd = useServerFn(updateOrderStatus);
  const [status, setStatus] = useState<string>("");
  const q = useQuery({
    queryKey: ["admin-orders", status],
    queryFn: () => list({ data: { scope: "all", status: status || undefined } }),
  });

  const m = useMutation({
    mutationFn: (i: { id: string; status: any }) => upd({ data: i }) as Promise<any>,
    onSuccess: () => {
      toast.success("Updated");
      qc.invalidateQueries({ queryKey: ["admin-orders"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
          <h1 className="font-display text-lg font-bold">Orders</h1>
          <div className="ml-auto w-44">
            <Select value={status || "all"} onValueChange={(v) => setStatus(v === "all" ? "" : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {STATUS_FILTERS.map((s: string) => <SelectItem key={s} value={s}>{STATUS_LABEL[s as keyof typeof STATUS_LABEL]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        <div className="overflow-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tracking</TableHead><TableHead>Partner</TableHead><TableHead>Customer</TableHead><TableHead>Delivery details</TableHead><TableHead>Price</TableHead><TableHead>Status</TableHead><TableHead>Staff</TableHead><TableHead>Actions</TableHead><TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(q.data ?? []).map((o: any) => (
              <TableRow key={o.id}>
                <TableCell><Link to="/track/$trackingNo" params={{ trackingNo: o.tracking_no }} className="text-primary underline">{o.tracking_no}</Link></TableCell>
                <TableCell>
                  <div className="max-w-[180px]">
                    <p className="font-medium">{o.vendor?.store_name ?? "—"}</p>
                    {o.vendor?.phone && <p className="text-xs text-muted-foreground">{o.vendor.phone}</p>}
                  </div>
                </TableCell>
                <TableCell>
                  <p className="font-medium">{o.customer_name}</p>
                  <p className="text-xs text-muted-foreground">{o.customer_phone}</p>
                </TableCell>
                <TableCell className="min-w-[280px] max-w-[360px]">
                  <div className="space-y-1 text-xs">
                    <p><span className="font-semibold text-foreground">Drop-off:</span> {o.delivery_address ?? "—"}</p>
                    {o.vendor?.address && <p><span className="font-semibold text-foreground">Pickup:</span> {o.vendor.address}</p>}
                    <p className="text-muted-foreground">
                      {[o.pickup_zone_name && `From ${o.pickup_zone_name}`, o.dropoff_zone_name && `To ${o.dropoff_zone_name}`, o.vehicle_type_name].filter(Boolean).join(" · ") || "—"}
                    </p>
                    {o.notes && <p className="rounded-md border bg-secondary/40 p-2 text-foreground">{o.notes}</p>}
                  </div>
                </TableCell>
                <TableCell>{Number(o.total).toFixed(2)}</TableCell>
                <TableCell><StatusBadge status={o.status} /></TableCell>
                <TableCell className="text-xs">
                  <div className="space-y-0.5">
                    <p>Picked: {o.picked_by_name ?? <span className="text-muted-foreground">—</span>}</p>
                    <p>Delivered: {o.delivered_by_name ?? <span className="text-muted-foreground">—</span>}</p>
                  </div>
                </TableCell>
                <TableCell>
                  <ActionRow status={o.status} onAction={(next) => m.mutate({ id: o.id, status: next })} disabled={m.isPending} />
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleString()}</TableCell>
              </TableRow>
            ))}
            {(q.data ?? []).length === 0 && !q.isLoading && (
              <TableRow><TableCell colSpan={9} className="text-center text-sm text-muted-foreground">No orders yet</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
        </div>
      </main>
    </div>
  );
}

function ActionRow({
  status,
  onAction,
  disabled,
}: {
  status: string;
  onAction: (next: "accepted" | "rejected" | "picked_up" | "delivered" | "cancelled") => void;
  disabled?: boolean;
}) {
  const terminal = status === "delivered" || status === "cancelled" || status === "rejected";
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {status === "pending" && (
        <>
          <Button size="sm" className="h-7 px-2 text-xs" disabled={disabled} onClick={() => onAction("accepted")}>Approve</Button>
          <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={disabled} onClick={() => onAction("rejected")}>Reject</Button>
        </>
      )}
      {(status === "accepted" || status === "ready_for_pickup") && (
        <Button size="sm" className="h-7 px-2 text-xs" disabled={disabled} onClick={() => onAction("picked_up")}>Picked</Button>
      )}
      {(status === "picked_up" || status === "on_the_way" || status === "preparing") && (
        <Button size="sm" className="h-7 px-2 text-xs" disabled={disabled} onClick={() => onAction("delivered")}>Delivered</Button>
      )}
      {!terminal && (
        <Button size="sm" variant="destructive" className="h-7 px-2 text-xs" disabled={disabled} onClick={() => onAction("cancelled")}>Cancel</Button>
      )}
      {terminal && <span className="text-xs text-muted-foreground">—</span>}
    </div>
  );
}