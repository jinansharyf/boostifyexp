import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { listBilling, recordPayment } from "@/lib/billing.functions";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/admin/billing")({
  component: AdminBilling,
});

function AdminBilling() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const list = useServerFn(listBilling);
  const pay = useServerFn(recordPayment);
  const q = useQuery({ queryKey: ["admin-billing"], queryFn: () => list({ data: { scope: "all" } }) });

  const [openFor, setOpenFor] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  const m = useMutation({
    mutationFn: () => pay({ data: { partner_id: openFor!, amount: Number(amount), note } }),
    onSuccess: () => {
      toast.success("Payment recorded");
      qc.invalidateQueries({ queryKey: ["admin-billing"] });
      setOpenFor(null); setAmount(""); setNote("");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
          <h1 className="font-display text-lg font-bold">Partner billing</h1>
        </div>
      </header>
      <main className="mx-auto max-w-6xl space-y-8 px-4 py-6">
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Balances</h2>
          <div className="overflow-auto rounded-xl border bg-card">
          <Table>
            <TableHeader><TableRow><TableHead>Partner</TableHead><TableHead>Unpaid</TableHead><TableHead>Paid</TableHead><TableHead>Payments received</TableHead><TableHead></TableHead></TableRow></TableHeader>
            <TableBody>
              {(q.data?.summary ?? []).map((s: any) => (
                <TableRow key={s.partner_id}>
                  <TableCell>{s.partner_name}</TableCell>
                  <TableCell className="font-semibold text-amber-600">{Number(s.unpaid).toFixed(2)}</TableCell>
                  <TableCell>{Number(s.paid).toFixed(2)}</TableCell>
                  <TableCell>{Number(s.payments).toFixed(2)}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" onClick={() => { setOpenFor(s.partner_id); setAmount(String(s.unpaid)); }}>Record payment</Button>
                  </TableCell>
                </TableRow>
              ))}
              {(q.data?.summary ?? []).length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground">No billing yet</TableCell></TableRow>}
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
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Payments received</h2>
          <div className="overflow-auto rounded-xl border bg-card">
          <Table>
            <TableHeader><TableRow><TableHead>Amount</TableHead><TableHead>Note</TableHead><TableHead>When</TableHead></TableRow></TableHeader>
            <TableBody>
              {(q.data?.payments ?? []).map((p: any) => (
                <TableRow key={p.id}><TableCell>{Number(p.amount).toFixed(2)}</TableCell><TableCell>{p.note}</TableCell><TableCell className="text-xs text-muted-foreground">{new Date(p.created_at).toLocaleString()}</TableCell></TableRow>
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