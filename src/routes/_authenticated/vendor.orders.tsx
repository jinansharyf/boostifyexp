import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Plus } from "lucide-react";
import { toast } from "sonner";
import { listOrders, updateOrderStatus } from "@/lib/orders.functions";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const STATUSES = ["pending", "accepted", "preparing", "picked_up", "on_the_way", "delivered", "cancelled"] as const;

export const Route = createFileRoute("/_authenticated/vendor/orders")({
  component: VendorOrders,
});

function VendorOrders() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const list = useServerFn(listOrders);
  const upd = useServerFn(updateOrderStatus);
  const [status, setStatus] = useState<string>("");
  const q = useQuery({
    queryKey: ["vendor-orders", status],
    queryFn: () => list({ data: { scope: "mine", status: status || undefined } }),
  });
  const m = useMutation({
    mutationFn: (i: { id: string; status: any }) => upd({ data: i }),
    onSuccess: () => {
      toast.success("Updated");
      qc.invalidateQueries({ queryKey: ["vendor-orders"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4">
          <button onClick={() => navigate({ to: "/vendor" })} className="rounded-full border px-3 py-1.5 text-xs"><ArrowLeft className="mr-1 inline h-3 w-3" /> Back</button>
          <h1 className="font-display text-lg font-bold">My orders</h1>
          <div className="ml-auto flex items-center gap-2">
            <div className="w-36"><Select value={status || "all"} onValueChange={(v) => setStatus(v === "all" ? "" : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">All</SelectItem>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select></div>
            <a href="/vendor/orders/new" className="inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"><Plus className="mr-1 h-3 w-3" /> New</a>
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
                <TableCell>
                  <Select value={o.status} onValueChange={(v) => m.mutate({ id: o.id, status: v })}>
                    <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleString()}</TableCell>
              </TableRow>
            ))}
            {(q.data ?? []).length === 0 && !q.isLoading && <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground">No orders yet</TableCell></TableRow>}
          </TableBody>
        </Table>
        </div>
      </main>
    </div>
  );
}