import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/app-supabase/client";
import { listOrders, updateOrderStatus } from "@/lib/orders.functions";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { STATUS_LABEL, STATUS_FILTERS, StatusBadge } from "@/components/site/order-status";
import { useOrderBrowserNotifications } from "@/hooks/use-order-browser-notifications";

export const Route = createFileRoute("/_authenticated/admin/orders")({
  component: AdminOrders,
});

function AdminOrders() {
  const qc = useQueryClient();
  useOrderBrowserNotifications("all");
  const list = useServerFn(listOrders);
  const upd = useServerFn(updateOrderStatus);
  const [status, setStatus] = useState<string>("");
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
              <TableHead>Tracking</TableHead><TableHead>Partner</TableHead><TableHead>Customer</TableHead><TableHead>Address</TableHead><TableHead>Price</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead><TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(q.data ?? []).map((o: any) => (
              <TableRow key={o.id}>
                <TableCell><Link to="/track/$trackingNo" params={{ trackingNo: o.tracking_no }} className="text-primary underline">{o.tracking_no}</Link></TableCell>
                <TableCell>{vendorMap[o.vendor_id] ?? "—"}</TableCell>
                <TableCell>{o.customer_name}<div className="text-xs text-muted-foreground">{o.customer_phone}</div></TableCell>
                <TableCell className="max-w-[200px] truncate">{o.delivery_address}</TableCell>
                <TableCell>{Number(o.total).toFixed(2)}</TableCell>
                <TableCell><StatusBadge status={o.status} /></TableCell>
                <TableCell>
                  <ActionRow status={o.status} onAction={(next) => m.mutate({ id: o.id, status: next })} disabled={m.isPending} />
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleString()}</TableCell>
              </TableRow>
            ))}
            {(q.data ?? []).length === 0 && !q.isLoading && (
              <TableRow><TableCell colSpan={8} className="text-center text-sm text-muted-foreground">No orders yet</TableCell></TableRow>
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
      {status === "accepted" && (
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