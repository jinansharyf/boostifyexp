import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { listBilling, listBillingPeriods, getMyBillingCycle, setMyBillingCycle } from "@/lib/billing.functions";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/vendor/billing")({
  component: VendorBilling,
});

function VendorBilling() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const list = useServerFn(listBilling);
  const listPeriods = useServerFn(listBillingPeriods);
  const getCycle = useServerFn(getMyBillingCycle);
  const setCycle = useServerFn(setMyBillingCycle);
  const q = useQuery({ queryKey: ["vendor-billing"], queryFn: () => list({ data: { scope: "mine" } }) });
  const cycleQ = useQuery({ queryKey: ["vendor-billing-cycle"], queryFn: () => getCycle() });
  const periodsQ = useQuery({
    queryKey: ["vendor-billing-periods", cycleQ.data?.billing_cycle],
    enabled: !!cycleQ.data,
    queryFn: () => listPeriods({ data: { scope: "mine" } }),
  });
  const m = useMutation({
    mutationFn: (v: "weekly" | "monthly") => setCycle({ data: { billing_cycle: v } }),
    onSuccess: () => {
      toast.success("Billing cycle updated");
      qc.invalidateQueries({ queryKey: ["vendor-billing-cycle"] });
      qc.invalidateQueries({ queryKey: ["vendor-billing-periods"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  const sum = ((q.data?.summary ?? []) as any[])[0];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-4">
          <h1 className="font-display text-lg font-bold">My billing</h1>
        </div>
      </header>
      <main className="mx-auto max-w-3xl space-y-6 px-4 py-6">
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
          <div>
            <p className="text-sm font-semibold">Billing cycle</p>
            <p className="text-xs text-muted-foreground">Totals are grouped and billed per {cycleQ.data?.billing_cycle ?? "weekly"} period.</p>
          </div>
          <div className="w-40">
            <Select value={cycleQ.data?.billing_cycle ?? "weekly"} onValueChange={(v) => m.mutate(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </section>

        <div className="grid grid-cols-3 gap-3">
          <Card label="Outstanding" value={sum?.unpaid ?? 0} tone="text-amber-600" />
          <Card label="Paid" value={sum?.paid ?? 0} tone="text-emerald-600" />
          <Card label="Payments sent" value={sum?.payments ?? 0} tone="" />
        </div>

        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {cycleQ.data?.billing_cycle === "monthly" ? "Monthly" : "Weekly"} totals
          </h2>
          <div className="overflow-auto rounded-xl border bg-card">
          <Table>
            <TableHeader><TableRow><TableHead>Period</TableHead><TableHead>Orders</TableHead><TableHead>Total</TableHead><TableHead>Outstanding</TableHead><TableHead>Paid</TableHead></TableRow></TableHeader>
            <TableBody>
              {(periodsQ.data?.periods ?? []).map((p: any) => (
                <TableRow key={p.period}>
                  <TableCell className="font-medium">{formatPeriod(p.period, periodsQ.data!.cycle)}</TableCell>
                  <TableCell>{p.count}</TableCell>
                  <TableCell>{Number(p.total).toFixed(2)}</TableCell>
                  <TableCell className="text-amber-600">{Number(p.unpaid).toFixed(2)}</TableCell>
                  <TableCell className="text-emerald-600">{Number(p.paid).toFixed(2)}</TableCell>
                </TableRow>
              ))}
              {(periodsQ.data?.periods ?? []).length === 0 && !periodsQ.isLoading && (
                <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground">No billable orders yet</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Billing entries</h2>
          <div className="overflow-auto rounded-xl border bg-card">
          <Table>
            <TableHeader><TableRow><TableHead>Order</TableHead><TableHead>Amount</TableHead><TableHead>Status</TableHead><TableHead>Date</TableHead></TableRow></TableHeader>
            <TableBody>
              {(q.data?.entries ?? []).map((e: any) => (
                <TableRow key={e.id}>
                  <TableCell className="font-mono text-xs">{e.tracking_no ?? String(e.order_id).slice(0, 8)}</TableCell>
                  <TableCell>{Number(e.amount).toFixed(2)}</TableCell>
                  <TableCell>{e.status}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Payments recorded by admin</h2>
          <div className="overflow-auto rounded-xl border bg-card">
          <Table>
            <TableHeader><TableRow><TableHead>Amount</TableHead><TableHead>Note</TableHead><TableHead>Date</TableHead></TableRow></TableHeader>
            <TableBody>
              {(q.data?.payments ?? []).map((p: any) => (
                <TableRow key={p.id}><TableCell>{Number(p.amount).toFixed(2)}</TableCell><TableCell>{p.note}</TableCell><TableCell className="text-xs text-muted-foreground">{new Date(p.created_at).toLocaleString()}</TableCell></TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
        </section>
      </main>
    </div>
  );
}

function formatPeriod(key: string, cycle: "weekly" | "monthly") {
  if (cycle === "monthly") {
    const [y, m] = key.split("-");
    const d = new Date(Date.UTC(Number(y), Number(m) - 1, 1));
    return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }
  const start = new Date(key + "T00:00:00Z");
  const end = new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${fmt(start)} – ${fmt(end)}`;
}

function Card({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-xl border bg-card p-3">
      <div className={`font-display text-2xl font-bold ${tone}`}>{Number(value).toFixed(2)}</div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}