import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft } from "lucide-react";
import { listBilling } from "@/lib/billing.functions";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/vendor/billing")({
  component: VendorBilling,
});

function VendorBilling() {
  const navigate = useNavigate();
  const list = useServerFn(listBilling);
  const q = useQuery({ queryKey: ["vendor-billing"], queryFn: () => list({ data: { scope: "mine" } }) });
  const sum = ((q.data?.summary ?? []) as any[])[0];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-4">
          <button onClick={() => navigate({ to: "/vendor" })} className="rounded-full border px-3 py-1.5 text-xs"><ArrowLeft className="mr-1 inline h-3 w-3" /> Back</button>
          <h1 className="font-display text-lg font-bold">My billing</h1>
        </div>
      </header>
      <main className="mx-auto max-w-3xl space-y-6 px-4 py-6">
        <div className="grid grid-cols-3 gap-3">
          <Card label="Outstanding" value={sum?.unpaid ?? 0} tone="text-amber-600" />
          <Card label="Paid" value={sum?.paid ?? 0} tone="text-emerald-600" />
          <Card label="Payments sent" value={sum?.payments ?? 0} tone="" />
        </div>

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

function Card({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-xl border bg-card p-3">
      <div className={`font-display text-2xl font-bold ${tone}`}>{Number(value).toFixed(2)}</div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}