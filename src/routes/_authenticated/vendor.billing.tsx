import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileText, Upload } from "lucide-react";
import { toast } from "sonner";
import {
  listBilling,
  listBillingPeriods,
  getMyBillingCycle,
  setMyBillingCycle,
  getBankSettings,
  submitPartnerPayment,
} from "@/lib/billing.functions";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ImageUpload } from "@/components/site/image-upload";

export const Route = createFileRoute("/_authenticated/vendor/billing")({
  component: VendorBilling,
});

function VendorBilling() {
  const qc = useQueryClient();
  const list = useServerFn(listBilling);
  const listPeriods = useServerFn(listBillingPeriods);
  const getCycle = useServerFn(getMyBillingCycle);
  const setCycle = useServerFn(setMyBillingCycle);
  const bankFn = useServerFn(getBankSettings);
  const submitFn = useServerFn(submitPartnerPayment);
  const q = useQuery({ queryKey: ["vendor-billing"], queryFn: () => list({ data: { scope: "mine" } }) });
  const cycleQ = useQuery({ queryKey: ["vendor-billing-cycle"], queryFn: () => getCycle() });
  const periodsQ = useQuery({
    queryKey: ["vendor-billing-periods", cycleQ.data?.billing_cycle],
    enabled: !!cycleQ.data,
    queryFn: () => listPeriods({ data: { scope: "mine" } }),
  });
  const bankQ = useQuery({ queryKey: ["bank-settings"], queryFn: () => bankFn() });

  const m = useMutation({
    mutationFn: (v: "weekly" | "monthly") => setCycle({ data: { billing_cycle: v } }),
    onSuccess: () => {
      toast.success("Billing cycle updated");
      qc.invalidateQueries({ queryKey: ["vendor-billing-cycle"] });
      qc.invalidateQueries({ queryKey: ["vendor-billing-periods"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const [payOpen, setPayOpen] = useState<{ period?: string; amount?: number } | null>(null);
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);

  const submitM = useMutation({
    mutationFn: () =>
      submitFn({
        data: {
          amount: Number(amount),
          receipt_url: receiptUrl!,
          reference: reference || null,
          note: note || null,
          period_key: payOpen?.period ?? null,
          cycle: (cycleQ.data?.billing_cycle ?? "weekly") as any,
        },
      }),
    onSuccess: () => {
      toast.success("Payment submitted for verification");
      setPayOpen(null);
      setAmount(""); setReference(""); setNote(""); setReceiptUrl(null);
      qc.invalidateQueries({ queryKey: ["vendor-billing"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const openPayFor = (period?: string, amount?: number) => {
    setPayOpen({ period, amount });
    if (amount) setAmount(String(amount));
  };

  const vendorId = cycleQ.data?.vendor_id;

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
            <p className="text-xs text-muted-foreground">
              Totals are grouped and billed per{" "}
              <strong className="capitalize">{cycleQ.data?.billing_cycle ?? "weekly"}</strong> period. Only admins can change this — contact support if you need it changed.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full border bg-secondary px-3 py-1 text-xs font-semibold capitalize">
              {cycleQ.data?.billing_cycle ?? "weekly"}
            </span>
            <Button onClick={() => openPayFor(undefined, sum?.unpaid ?? 0)}>
              <Upload className="mr-2 h-4 w-4" /> Submit payment
            </Button>
          </div>
        </section>

        {/* Bank details */}
        {(bankQ.data?.bank_name || bankQ.data?.bank_account_number) && (
          <section className="rounded-xl border bg-card p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pay to</p>
            <div className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
              {bankQ.data?.bank_name && <p><strong>Bank:</strong> {bankQ.data.bank_name}</p>}
              {bankQ.data?.bank_account_name && <p><strong>Account name:</strong> {bankQ.data.bank_account_name}</p>}
              {bankQ.data?.bank_account_number && <p><strong>Account #:</strong> {bankQ.data.bank_account_number}</p>}
              {bankQ.data?.bank_branch && <p><strong>Branch:</strong> {bankQ.data.bank_branch}</p>}
              {bankQ.data?.bank_iban && <p><strong>IBAN:</strong> {bankQ.data.bank_iban}</p>}
              {bankQ.data?.bank_swift && <p><strong>SWIFT:</strong> {bankQ.data.bank_swift}</p>}
            </div>
            {bankQ.data?.bank_instructions && (
              <p className="mt-2 whitespace-pre-line text-xs text-muted-foreground">{bankQ.data.bank_instructions}</p>
            )}
          </section>
        )}

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
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" asChild>
                        <Link to="/invoice" search={{ cycle: periodsQ.data!.cycle, period: p.period }}>
                          <FileText className="mr-1 h-3.5 w-3.5" /> Invoice
                        </Link>
                      </Button>
                      {p.unpaid > 0 && (
                        <Button size="sm" onClick={() => openPayFor(p.period, p.unpaid)}>Pay</Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {(periodsQ.data?.periods ?? []).length === 0 && !periodsQ.isLoading && (
                <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground">No billable orders yet</TableCell></TableRow>
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
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">My payment submissions</h2>
          <div className="overflow-auto rounded-xl border bg-card">
          <Table>
            <TableHeader><TableRow><TableHead>Amount</TableHead><TableHead>Status</TableHead><TableHead>Reference</TableHead><TableHead>Receipt</TableHead><TableHead>Date</TableHead></TableRow></TableHeader>
            <TableBody>
              {(q.data?.payments ?? []).map((p: any) => (
                <TableRow key={p.id}>
                  <TableCell>{Number(p.amount).toFixed(2)}</TableCell>
                  <TableCell><StatusPill status={p.status ?? "verified"} /></TableCell>
                  <TableCell className="text-xs">{p.reference ?? p.note ?? "—"}</TableCell>
                  <TableCell>{p.receipt_url ? <a href={p.receipt_url} target="_blank" rel="noreferrer" className="text-primary underline">View</a> : "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{new Date(p.created_at).toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
        </section>

        {/* Submit payment dialog */}
        <Dialog open={!!payOpen} onOpenChange={(o) => !o && setPayOpen(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Submit payment</DialogTitle></DialogHeader>
            <div className="space-y-3">
              {payOpen?.period && (
                <p className="text-xs text-muted-foreground">For period <strong>{formatPeriod(payOpen.period, cycleQ.data?.billing_cycle ?? "weekly")}</strong></p>
              )}
              <Input type="number" step="0.01" placeholder="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
              <Input placeholder="Reference / transaction ID (optional)" value={reference} onChange={(e) => setReference(e.target.value)} />
              <Textarea placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
              <div>
                <p className="mb-2 text-xs font-medium">Receipt (image or PDF)</p>
                {vendorId ? (
                  <ImageUpload
                    bucket="vendor-assets"
                    pathPrefix={`${vendorId}/receipts`}
                    value={receiptUrl}
                    onChange={setReceiptUrl}
                    label="Receipt"
                    shape="rect"
                    aspect="aspect-[4/3]"
                  />
                ) : (
                  <p className="text-xs text-muted-foreground">Loading…</p>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={() => submitM.mutate()}
                disabled={!amount || Number(amount) <= 0 || !receiptUrl || submitM.isPending}
              >
                {submitM.isPending ? "Submitting…" : "Submit for verification"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "verified" ? "bg-emerald-100 text-emerald-700" :
    status === "rejected" ? "bg-red-100 text-red-700" :
    "bg-amber-100 text-amber-700";
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${tone}`}>{status}</span>;
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