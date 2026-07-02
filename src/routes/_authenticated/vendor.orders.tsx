import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus } from "lucide-react";
import { listOrders } from "@/lib/orders.functions";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NewOrderDialog } from "@/components/site/new-order-dialog";
import { STATUS_LABEL, StatusBadge } from "@/components/site/order-status";
import { useOrderBrowserNotifications } from "@/hooks/use-order-browser-notifications";

// Partners only see the outcomes that matter to them.
const VENDOR_FILTERS = ["pending", "accepted", "rejected", "delivered", "cancelled"] as const;

export const Route = createFileRoute("/_authenticated/vendor/orders")({
  component: VendorOrders,
});

function VendorOrders() {
  const qc = useQueryClient();
  useOrderBrowserNotifications("mine");
  const list = useServerFn(listOrders);
  const [status, setStatus] = useState<string>("");
  const [openNew, setOpenNew] = useState(false);
  const q = useQuery({
    queryKey: ["vendor-orders", status],
    queryFn: () => list({ data: { scope: "mine", status: status || undefined } }),
  });
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4">
          <h1 className="font-display text-lg font-bold">My orders</h1>
          <div className="ml-auto flex items-center gap-2">
            <div className="w-36"><Select value={status || "all"} onValueChange={(v) => setStatus(v === "all" ? "" : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">All</SelectItem>{VENDOR_FILTERS.map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}</SelectContent>
            </Select></div>
            <Button size="sm" onClick={() => setOpenNew(true)}><Plus className="mr-1 h-3 w-3" /> New</Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <div className="overflow-auto rounded-xl border bg-card">
        <Table>
          <TableHeader><TableRow><TableHead>Tracking</TableHead><TableHead>Customer</TableHead><TableHead>Price</TableHead><TableHead>Status</TableHead><TableHead>Created</TableHead></TableRow></TableHeader>
          <TableBody>
            {(q.data ?? []).map((o: any) => (
              <TableRow key={o.id}>
                <TableCell><Link to="/track/$trackingNo" params={{ trackingNo: o.tracking_no }} className="text-primary underline">{o.tracking_no}</Link></TableCell>
                <TableCell>{o.customer_name}<div className="text-xs text-muted-foreground">{o.customer_phone}</div></TableCell>
                <TableCell>{Number(o.total).toFixed(2)}</TableCell>
                <TableCell><StatusBadge status={o.status} /></TableCell>
                <TableCell className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleString()}</TableCell>
              </TableRow>
            ))}
            {(q.data ?? []).length === 0 && !q.isLoading && <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground">No orders yet</TableCell></TableRow>}
          </TableBody>
        </Table>
        </div>
      </main>
      <NewOrderDialog open={openNew} onOpenChange={setOpenNew} onCreated={() => qc.invalidateQueries({ queryKey: ["vendor-orders"] })} />
    </div>
  );
}