import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/app-supabase/auth-middleware";

const tbl = (sb: any, name: string) => sb.from(name as any);

async function isAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.from("user_roles").select("role").eq("user_id", ctx.userId);
  const roles = (data ?? []).map((r: any) => r.role);
  return roles.includes("admin") || roles.includes("super_admin");
}

export const listBilling = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        scope: z.enum(["mine", "all"]).default("mine"),
        partner_id: z.string().uuid().optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/app-supabase/client.server");
    const admin = await isAdmin(context);

    // partner ids to include
    let partnerIds: string[] | null = null;
    if (data.scope === "mine" || !admin) {
      const { data: vendors } = await tbl(supabaseAdmin, "vendors")
        .select("id")
        .eq("owner_id", context.userId);
      partnerIds = (vendors ?? []).map((v: any) => v.id);
      if (partnerIds.length === 0) {
        return { entries: [], payments: [], summary: [] as any[] };
      }
    } else if (data.partner_id) {
      partnerIds = [data.partner_id];
    }

    let entriesQ = tbl(supabaseAdmin, "partner_billing_entries")
      .select("id, order_id, partner_id, amount, status, paid_at, created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    let paymentsQ = tbl(supabaseAdmin, "partner_payments")
      .select("id, partner_id, amount, note, created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    if (partnerIds) {
      entriesQ = entriesQ.in("partner_id", partnerIds);
      paymentsQ = paymentsQ.in("partner_id", partnerIds);
    }
    const [entriesR, paymentsR] = await Promise.all([entriesQ, paymentsQ]);
    if (entriesR.error) throw entriesR.error;
    if (paymentsR.error) throw paymentsR.error;

    const entries = (entriesR.data ?? []) as any[];
    const payments = (paymentsR.data ?? []) as any[];

    // Attach tracking_no
    const orderIds = entries.map((e) => e.order_id);
    let orderMap: Record<string, string> = {};
    if (orderIds.length > 0) {
      const { data: orders } = await tbl(supabaseAdmin, "orders")
        .select("id, tracking_no")
        .in("id", orderIds);
      for (const o of (orders ?? []) as any[]) orderMap[o.id] = o.tracking_no;
    }
    const entriesOut = entries.map((e) => ({ ...e, tracking_no: orderMap[e.order_id] ?? null }));

    // Summary per partner
    const byPartner: Record<string, { unpaid: number; paid: number; void: number; payments: number }> = {};
    for (const e of entries) {
      const k = e.partner_id as string;
      byPartner[k] = byPartner[k] ?? { unpaid: 0, paid: 0, void: 0, payments: 0 };
      const amt = Number(e.amount);
      if (e.status === "unpaid") byPartner[k].unpaid += amt;
      else if (e.status === "paid") byPartner[k].paid += amt;
      else byPartner[k].void += amt;
    }
    for (const p of payments) {
      const k = p.partner_id as string;
      byPartner[k] = byPartner[k] ?? { unpaid: 0, paid: 0, void: 0, payments: 0 };
      byPartner[k].payments += Number(p.amount);
    }

    // Attach partner names
    const ids = Object.keys(byPartner);
    let nameMap: Record<string, string> = {};
    if (ids.length > 0) {
      const { data: vs } = await tbl(supabaseAdmin, "vendors")
        .select("id, store_name")
        .in("id", ids);
      for (const v of (vs ?? []) as any[]) nameMap[v.id] = v.store_name;
    }
    const summary = ids.map((id) => ({
      partner_id: id,
      partner_name: nameMap[id] ?? "Partner",
      ...byPartner[id],
    }));

    return { entries: entriesOut, payments, summary };
  });

export const recordPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        partner_id: z.string().uuid(),
        amount: z.number().positive(),
        note: z.string().max(500).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    if (!(await isAdmin(context))) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/app-supabase/client.server");

    // Insert payment
    const { error: payErr } = await tbl(supabaseAdmin, "partner_payments").insert({
      partner_id: data.partner_id,
      amount: data.amount,
      note: data.note ?? null,
      recorded_by: context.userId,
    });
    if (payErr) throw payErr;

    // Apply against unpaid entries oldest-first
    const { data: unpaid } = await tbl(supabaseAdmin, "partner_billing_entries")
      .select("id, amount")
      .eq("partner_id", data.partner_id)
      .eq("status", "unpaid")
      .order("created_at", { ascending: true });
    let remaining = data.amount;
    const toMarkPaid: string[] = [];
    for (const e of (unpaid ?? []) as any[]) {
      const amt = Number(e.amount);
      if (remaining + 1e-9 >= amt) {
        toMarkPaid.push(e.id);
        remaining -= amt;
      } else {
        break;
      }
    }
    if (toMarkPaid.length > 0) {
      await tbl(supabaseAdmin, "partner_billing_entries")
        .update({ status: "paid", paid_at: new Date().toISOString() })
        .in("id", toMarkPaid);
    }
    return { ok: true as const, applied: toMarkPaid.length, leftover: remaining };
  });