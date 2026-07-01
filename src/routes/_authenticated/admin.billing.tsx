import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileText, Check, X } from "lucide-react";
import { toast } from "sonner";
import {
  listBilling,
  recordPayment,
  getBankSettings,
  saveBankSettings,
  reviewPartnerPayment,
  setPartnerBillingCycle,
} from "@/lib/billing.functions";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/admin/billing")({
  component: AdminBilling,
});

function AdminBilling() {
  const qc = useQueryClient();
  const list = useServerFn(listBilling);
  const pay = useServerFn(recordPayment);
  const bankGet = useServerFn(getBankSettings);
  const bankSave = useServerFn(saveBankSettings);
  const review = useServerFn(reviewPartnerPayment);
  const setCycleFn = useServerFn(setPartnerBillingCycle);
  const q = useQuery({ queryKey: ["admin-billing"], queryFn: () => list({ data: { scope: "all" } }) });
  const bankQ = useQuery({ queryKey: ["bank-settings"], queryFn: () => bankGet() });

  const [openFor, setOpenFor] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [bank, setBank] = useState<Record<string, string>>({});
  useEffect(() => {
    if (bankQ.data) setBank(bankQ.data);
  }, [bankQ.data]);

  const m = useMutation({
    mutationFn: () => pay({ data: { partner_id: openFor!, amount: Number(amount), note } }),
    onSuccess: () => {
      toast.success("Payment recorded");
      qc.invalidateQueries({ queryKey: ["admin-billing"] });
      setOpenFor(null); setAmount(""); setNote("");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const saveBankM = useMutation({
    mutationFn: () => bankSave({ data: bank }),
    onSuccess: () => { toast.success("Bank details saved"); qc.invalidateQueries({ queryKey: ["bank-settings"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const reviewM = useMutation({
    mutationFn: (v: { payment_id: string; action: "verify" | "reject"; rejected_reason?: string }) =>
      review({ data: v }),
    onSuccess: () => {
      toast.success("Updated");
      qc.invalidateQueries({ queryKey: ["admin-billing"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const cycleM = useMutation({
    mutationFn: (v: { partner_id: string; billing_cycle: "weekly" | "monthly" }) => setCycleFn({ data: v }),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: ["admin-billing"] });
      const prev = qc.getQueryData<any>(["admin-billing"]);
      if (prev?.summary) {
        qc.setQueryData(["admin-billing"], {
          ...prev,
          summary: prev.summary.map((s: any) =>
            s.partner_id === v.partner_id ? { ...s, billing_cycle: v.billing_cycle } : s,
          ),
        });
      }
      return { prev };
    },
    onSuccess: (_d, v) => {
      toast.success(`Billing cycle set to ${v.billing_cycle}`);
    },
    onError: (e: any, _v, ctx: any) => {
      if (ctx?.prev) qc.setQueryData(["admin-billing"], ctx.prev);
      toast.error(e?.message ?? "Failed to update billing cycle");
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["admin-billing"] });
    },
  });

  const pending = (q.data?.payments ?? []).filter((p: any) => p.status === "pending");

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
          <h1 className="font-display text-lg font-bold">Partner billing</h1>
        </div>
      </header>
      <main className="mx-auto max-w-6xl space-y-8 px-4 py-6">
        {/* Bank details */}
        <section className="rounded-xl border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="font-semibold">Bank details</h2>
              <p className="text-xs text-muted-foreground">Partners will see this on invoices and when submitting payments.</p>
            </div>
            <Button onClick={() => saveBankM.mutate()} disabled={saveBankM.isPending}>Save</Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Bank name" v={bank.bank_name} onChange={(v) => setBank({ ...bank, bank_name: v })} />
            <Field label="Account name" v={bank.bank_account_name} onChange={(v) => setBank({ ...bank, bank_account_name: v })} />
            <Field label="Account number" v={bank.bank_account_number} onChange={(v) => setBank({ ...bank, bank_account_number: v })} />
            <Field label="Branch" v={bank.bank_branch} onChange={(v) => setBank({ ...bank, bank_branch: v })} />
            <Field label="IBAN" v={bank.bank_iban} onChange={(v) => setBank({ ...bank, bank_iban: v })} />
            <Field label="SWIFT / BIC" v={bank.bank_swift} onChange={(v) => setBank({ ...bank, bank_swift: v })} />
          </div>
          <div className="mt-3">
            <label className="text-xs font-medium">Payment instructions</label>
            <Textarea value={bank.bank_instructions ?? ""} onChange={(e) => setBank({ ...bank, bank_instructions: e.target.value })} placeholder="e.g. Include your partner name in the transfer reference." />
          </div>
        </section>

        {/* Pending receipts */}
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pending receipts ({pending.length})</h2>
          <div className="overflow-auto rounded-xl border bg-card">
            <Table>
              <TableHeader><TableRow><TableHead>Partner</TableHead><TableHead>Amount</TableHead><TableHead>Reference</TableHead><TableHead>Period</TableHead><TableHead>Receipt</TableHead><TableHead>Submitted</TableHead><TableHead></TableHead></TableRow></TableHeader>
              <TableBody>
                {pending.map((p: any) => {
                  const partnerName = (q.data?.summary ?? []).find((s: any) => s.partner_id === p.partner_id)?.partner_name ?? p.partner_id.slice(0, 8);
                  return (
                    <TableRow key={p.id}>
                      <TableCell>{partnerName}</TableCell>
                      <TableCell className="font-semibold">{Number(p.amount).toFixed(2)}</TableCell>
                      <TableCell className="text-xs">{p.reference ?? p.note ?? "—"}</TableCell>
                      <TableCell className="text-xs">{p.period_key ?? "—"}</TableCell>
                      <TableCell>{p.receipt_url ? <a href={p.receipt_url} target="_blank" rel="noreferrer" className="text-primary underline">View</a> : "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{new Date(p.created_at).toLocaleString()}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" onClick={() => reviewM.mutate({ payment_id: p.id, action: "verify" })}>
                            <Check className="mr-1 h-3.5 w-3.5" /> Verify
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => {
                            const reason = window.prompt("Reason for rejection (optional)") ?? "";
                            reviewM.mutate({ payment_id: p.id, action: "reject", rejected_reason: reason });
                          }}>
                            <X className="mr-1 h-3.5 w-3.5" /> Reject
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {pending.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground">No pending receipts</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Balances</h2>
          <div className="overflow-auto rounded-xl border bg-card">
          <Table>
            <TableHeader><TableRow><TableHead>Partner</TableHead><TableHead>Cycle</TableHead><TableHead>Unpaid</TableHead><TableHead>Paid</TableHead><TableHead>Payments received</TableHead><TableHead></TableHead></TableRow></TableHeader>
            <TableBody>
              {(q.data?.summary ?? []).map((s: any) => (
                <TableRow key={s.partner_id}>
                  <TableCell>{s.partner_name}</TableCell>
                  <TableCell className="w-32">
                    <Select
                      value={s.billing_cycle ?? "weekly"}
                      onValueChange={(v) => cycleM.mutate({ partner_id: s.partner_id, billing_cycle: v as any })}
                      disabled={cycleM.isPending && cycleM.variables?.partner_id === s.partner_id}
                    >
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="font-semibold text-amber-600">{Number(s.unpaid).toFixed(2)}</TableCell>
                  <TableCell>{Number(s.paid).toFixed(2)}</TableCell>
                  <TableCell>{Number(s.payments).toFixed(2)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" asChild>
                        <Link to="/invoice" search={{ partner: s.partner_id, cycle: (s.billing_cycle ?? "weekly") as any, period: currentPeriodKey(s.billing_cycle ?? "weekly") }}>
                          <FileText className="mr-1 h-3.5 w-3.5" /> Invoice
                        </Link>
                      </Button>
                      <Button size="sm" onClick={() => { setOpenFor(s.partner_id); setAmount(String(s.unpaid)); }}>Record payment</Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {(q.data?.summary ?? []).length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground">No billing yet</TableCell></TableRow>}
            </TableBody>
          </Table>
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Billing entries</h2>
          <div className="overflow-auto rounded-xl border bg-card">
          <Table>
            <TableHeader><TableRow><TableHead>Order</TableHead><TableHead>Amount</TableHead><TableHead>Status</TableHead><TableHead>Created</TableHead></TableRow></TableHeader>
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
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">All payments</h2>
          <div className="overflow-auto rounded-xl border bg-card">
          <Table>
            <TableHeader><TableRow><TableHead>Amount</TableHead><TableHead>Status</TableHead><TableHead>Reference</TableHead><TableHead>Receipt</TableHead><TableHead>When</TableHead></TableRow></TableHeader>
            <TableBody>
              {(q.data?.payments ?? []).map((p: any) => (
                <TableRow key={p.id}>
                  <TableCell>{Number(p.amount).toFixed(2)}</TableCell>
                  <TableCell className="text-xs capitalize">{p.status ?? "verified"}</TableCell>
                  <TableCell className="text-xs">{p.reference ?? p.note ?? "—"}</TableCell>
                  <TableCell>{p.receipt_url ? <a href={p.receipt_url} target="_blank" rel="noreferrer" className="text-primary underline">View</a> : "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{new Date(p.created_at).toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
        </section>

        <Dialog open={!!openFor} onOpenChange={(o) => !o && setOpenFor(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Record payment</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Input type="number" placeholder="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
              <Textarea placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <DialogFooter>
              <Button onClick={() => m.mutate()} disabled={!amount || Number(amount) <= 0 || m.isPending}>Save payment</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}

function Field({ label, v, onChange }: { label: string; v?: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-xs font-medium">{label}</label>
      <Input value={v ?? ""} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function currentPeriodKey(cycle: "weekly" | "monthly"): string {
  const d = new Date();
  if (cycle === "monthly") return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() - day + 1);
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
}