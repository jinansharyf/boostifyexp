import { createFileRoute, Link } from "@tanstack/react-router";
import { Fragment, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/app-supabase/client";
import { listOrders, updateOrderStatus } from "@/lib/orders.functions";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight } from "lucide-react";
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
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const toggle = (id: string) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  const q = useQuery({
    queryKey: ["admin-orders", status],
    queryFn: () => list({ data: { scope: "all", status: status || undefined } }),
  });
  const [vendorMap, setVendorMap] = useState<Record<string, string>>({});
  useEffect(() => {
    (async () => {
      const ids = Array.from(new Set((q.data ?? []).map((o: any) => o.vendor_id).filter(Boolean))) as string[];
      if (ids.length === 0) return;
      const { data } = await supabase.from("vendors").select("id, store_name").in("id", ids);
      const m: Record<string, string> = {};
      for (const v of data ?? []) m[(v as any).id] = (v as any).store_name;
      setVendorMap(m);
    })();
  }, [q.data]);

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
      <main className="mx-auto max-w-6xl px-4 py-6">
        <div className="overflow-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" /><TableHead>Tracking</TableHead><TableHead>Partner</TableHead><TableHead>Customer</TableHead><TableHead>Address</TableHead><TableHead>Price</TableHead><TableHead>Status</TableHead><TableHead>Delivered by</TableHead><TableHead>Actions</TableHead><TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(q.data ?? []).map((o: any) => (
              <Fragment key={o.id}>
              <TableRow
                className="cursor-pointer hover:bg-muted/40"
                onClick={() => toggle(o.id)}
              >
                <TableCell className="w-8 text-muted-foreground">
                  {expanded[o.id] ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Link to="/track/$trackingNo" params={{ trackingNo: o.tracking_no }} className="text-primary underline">{o.tracking_no}</Link>
                </TableCell>
                <TableCell>{vendorMap[o.vendor_id] ?? "—"}</TableCell>
                <TableCell>{o.customer_name}<div className="text-xs text-muted-foreground">{o.customer_phone}</div></TableCell>
                <TableCell className="max-w-[220px]">
                  <span className="line-clamp-2 whitespace-normal break-words text-sm">{o.delivery_address}</span>
                </TableCell>
                <TableCell>{Number(o.total).toFixed(2)}</TableCell>
                <TableCell><StatusBadge status={o.status} /></TableCell>
                <TableCell className="text-xs">
                  {o.delivered_by_name ? o.delivered_by_name : <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <ActionRow status={o.status} onAction={(next) => m.mutate({ id: o.id, status: next })} disabled={m.isPending} />
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleString()}</TableCell>
              </TableRow>
              {expanded[o.id] && (
                <TableRow className="bg-muted/20 hover:bg-muted/20">
                  <TableCell colSpan={10} className="p-4">
                    <OrderDetail order={o} vendorName={vendorMap[o.vendor_id]} />
                  </TableCell>
                </TableRow>
              )}
              </Fragment>
            ))}
            {(q.data ?? []).length === 0 && !q.isLoading && (
              <TableRow><TableCell colSpan={10} className="text-center text-sm text-muted-foreground">No orders yet</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
        </div>
      </main>
    </div>
  );
}

function OrderDetail({ order, vendorName }: { order: any; vendorName?: string }) {
  const rows: Array<[string, React.ReactNode]> = [
    ["Tracking #", order.tracking_no],
    ["Partner", vendorName ?? "—"],
    ["Customer", order.customer_name],
    ["Phone", order.customer_phone ? <a className="text-primary underline" href={`tel:${order.customer_phone}`}>{order.customer_phone}</a> : "—"],
    ["Delivery address", <span className="whitespace-pre-wrap break-words">{order.delivery_address || "—"}</span>],
    ["Pickup address", order.pickup_address || "—"],
    ["Notes", <span className="whitespace-pre-wrap break-words">{order.notes || "—"}</span>],
    ["Payment", order.payment_method || "—"],
    ["Delivery fee", order.delivery_fee != null ? Number(order.delivery_fee).toFixed(2) : "—"],
    ["Total", Number(order.total ?? 0).toFixed(2)],
    ["Status", <StatusBadge status={order.status} />],
    ["Assigned to", order.assigned_to_name || "—"],
    ["Picked up by", order.picked_up_by_name || "—"],
    ["Delivered by", order.delivered_by_name || "—"],
    ["Commission", order.commission_amount != null
      ? `${Number(order.commission_amount).toFixed(2)} (${Number(order.commission_pct ?? 0)}%)`
      : "—"],
    ["Created", new Date(order.created_at).toLocaleString()],
    ["Updated", order.updated_at ? new Date(order.updated_at).toLocaleString() : "—"],
  ];
  return (
    <div className="space-y-4">
      <div className="grid gap-x-6 gap-y-2 text-sm md:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex flex-col gap-0.5 rounded-md border border-border/60 bg-card/60 px-3 py-2">
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
            <span className="text-sm">{value}</span>
          </div>
        ))}
      </div>
      {Array.isArray(order.timeline) && order.timeline.length > 0 && (
        <div className="rounded-md border border-border/60 bg-card/60 px-3 py-2">
          <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Status history</p>
          <ol className="space-y-1 text-xs">
            {order.timeline.map((e: any, i: number) => (
              <li key={i} className="flex flex-wrap items-center gap-2">
                <StatusBadge status={e.status} />
                <span className="text-muted-foreground">{new Date(e.created_at).toLocaleString()}</span>
                <span>· by <strong>{e.by_name || "system"}</strong></span>
              </li>
            ))}
          </ol>
        </div>
      )}
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