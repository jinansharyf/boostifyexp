import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getInvoicePeriod } from "@/lib/billing.functions";
import { z } from "zod";

const searchSchema = z.object({
  partner: z.string().uuid().optional(),
  cycle: z.enum(["weekly", "monthly"]).default("weekly"),
  period: z.string().min(4),
  print: z.enum(["1"]).optional(),
});

export const Route = createFileRoute("/_authenticated/invoice")({
  validateSearch: (s) => searchSchema.parse(s),
  component: InvoicePage,
});

function formatPeriod(key: string, cycle: "weekly" | "monthly") {
  if (cycle === "monthly") {
    const [y, m] = key.split("-");
    const d = new Date(Date.UTC(Number(y), Number(m) - 1, 1));
    return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }
  const start = new Date(key + "T00:00:00Z");
  const end = new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  return `${fmt(start)} – ${fmt(end)}`;
}

function InvoicePage() {
  const search = Route.useSearch();
  const fn = useServerFn(getInvoicePeriod);
  const q = useQuery({
    queryKey: ["invoice", search.partner ?? "mine", search.cycle, search.period],
    queryFn: () =>
      fn({ data: { partner_id: search.partner, cycle: search.cycle, period_key: search.period } }),
  });

  useEffect(() => {
    if (search.print === "1" && q.data) {
      setTimeout(() => window.print(), 300);
    }
  }, [search.print, q.data]);

  if (q.isLoading) return <div className="p-8 text-sm text-muted-foreground">Loading invoice…</div>;
  if (q.error) return <div className="p-8 text-sm text-red-600">{(q.error as Error).message}</div>;
  const d = q.data!;
  const partner = d.partner as any;
  const s = d.settings as any;
  const bank = s ?? {};

  return (
    <div className="min-h-screen bg-muted/40 py-6 print:bg-white print:py-0">
      <div className="mx-auto max-w-3xl px-4">
        <div className="mb-4 flex items-center justify-between print:hidden">
          <div className="text-sm text-muted-foreground">Invoice preview</div>
          <Button onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" /> Print / Save PDF
          </Button>
        </div>
        <div className="rounded-2xl border bg-white p-8 shadow-sm print:rounded-none print:border-0 print:shadow-none">
          {/* Header */}
          <div className="flex items-start justify-between gap-4 border-b pb-6">
            <div>
              {s?.logo_url && <img src={s.logo_url} alt="" className="mb-2 h-10 object-contain" />}
              <h1 className="text-2xl font-bold">{s?.site_name ?? "Invoice"}</h1>
              {s?.contact_email && <p className="text-xs text-muted-foreground">{s.contact_email}</p>}
              {s?.contact_phone && <p className="text-xs text-muted-foreground">{s.contact_phone}</p>}
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Invoice</p>
              <p className="font-mono text-sm">
                {d.cycle.toUpperCase()}-{d.period_key}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{formatPeriod(d.period_key, d.cycle)}</p>
            </div>
          </div>

          {/* Bill to */}
          <div className="grid gap-6 py-6 md:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase text-muted-foreground">Bill to</p>
              <p className="mt-1 font-semibold">{partner?.store_name}</p>
              {partner?.address && <p className="text-sm text-muted-foreground">{partner.address}</p>}
              {partner?.contact_phone && <p className="text-sm text-muted-foreground">{partner.contact_phone}</p>}
              {partner?.contact_email && <p className="text-sm text-muted-foreground">{partner.contact_email}</p>}
            </div>
            <div className="text-right">
              <p className="text-xs uppercase text-muted-foreground">Amount due</p>
              <p className="font-display text-3xl font-bold">{d.balance.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">Total {d.total.toFixed(2)} • Paid {d.paid_total.toFixed(2)}</p>
            </div>
          </div>

          {/* Lines */}
          <table className="w-full border-t text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-muted-foreground">
                <th className="py-2">Tracking</th>
                <th>Address</th>
                <th>Date</th>
                <th className="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {d.lines.map((l: any) => (
                <tr key={l.entry_id} className="border-t">
                  <td className="py-2 font-mono text-xs">{l.order?.tracking_no ?? "—"}</td>
                  <td className="max-w-[200px] truncate">{l.order?.delivery_address ?? "—"}</td>
                  <td className="text-xs text-muted-foreground">{new Date(l.created_at).toLocaleDateString()}</td>
                  <td className="text-right">{Number(l.amount).toFixed(2)}</td>
                </tr>
              ))}
              {d.lines.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-sm text-muted-foreground">
                    No deliveries in this period.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="border-t font-semibold">
                <td colSpan={3} className="py-2 text-right">Total</td>
                <td className="py-2 text-right">{d.total.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>

          {/* Bank */}
          {(bank.bank_name || bank.bank_account_number) && (
            <div className="mt-6 rounded-xl border bg-muted/50 p-4">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Pay to</p>
              <div className="mt-2 grid gap-1 text-sm">
                {bank.bank_name && <p><strong>Bank:</strong> {bank.bank_name}</p>}
                {bank.bank_account_name && <p><strong>Account name:</strong> {bank.bank_account_name}</p>}
                {bank.bank_account_number && <p><strong>Account #:</strong> {bank.bank_account_number}</p>}
                {bank.bank_branch && <p><strong>Branch:</strong> {bank.bank_branch}</p>}
                {bank.bank_iban && <p><strong>IBAN:</strong> {bank.bank_iban}</p>}
                {bank.bank_swift && <p><strong>SWIFT:</strong> {bank.bank_swift}</p>}
                {bank.bank_instructions && <p className="mt-1 whitespace-pre-line text-xs text-muted-foreground">{bank.bank_instructions}</p>}
              </div>
            </div>
          )}

          {/* Payments */}
          {d.payments.length > 0 && (
            <div className="mt-6">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Payments for this period</p>
              <table className="mt-2 w-full text-sm">
                <tbody>
                  {d.payments.map((p: any) => (
                    <tr key={p.id} className="border-t">
                      <td className="py-1.5">{new Date(p.created_at).toLocaleDateString()}</td>
                      <td className="text-xs">{p.reference ?? "—"}</td>
                      <td className="text-xs capitalize">{p.status}</td>
                      <td className="text-right">{Number(p.amount).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}