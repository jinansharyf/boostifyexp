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
      if ((partnerIds ?? []).length === 0) {
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
      .select("id, partner_id, amount, note, created_at, status, receipt_url, reference, period_key, cycle, rejected_reason")
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
    // Include ALL partners (admin scope) so the cycle can be set even before
    // the partner has any orders. Partner scope stays limited to their own ids.
    let nameMap: Record<string, string> = {};
    let cycleMap: Record<string, string> = {};
    let allIds: string[] = [];
    {
      let vq = tbl(supabaseAdmin, "vendors").select("id, store_name, billing_cycle");
      if (partnerIds) vq = vq.in("id", partnerIds);
      const { data: vs } = await vq;
      for (const v of (vs ?? []) as any[]) {
        nameMap[v.id] = v.store_name;
        cycleMap[v.id] = v.billing_cycle ?? "weekly";
        allIds.push(v.id);
      }
    }
    // Union of vendors + any partner ids seen in entries/payments (safety)
    const idSet = new Set<string>([...allIds, ...Object.keys(byPartner)]);
    const ids = Array.from(idSet);
    const summary = ids.map((id) => ({
      partner_id: id,
      partner_name: nameMap[id] ?? "Partner",
      billing_cycle: cycleMap[id] ?? "weekly",
      ...(byPartner[id] ?? { unpaid: 0, paid: 0, void: 0, payments: 0 }),
    }));

    return { entries: entriesOut, payments, summary };
  });

// Get/set partner billing cycle (weekly/monthly). Partner-only for own vendor.
export const getMyBillingCycle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/app-supabase/client.server");
    const { data } = await tbl(supabaseAdmin, "vendors")
      .select("id, billing_cycle")
      .eq("owner_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return { vendor_id: (data as any)?.id ?? null, billing_cycle: ((data as any)?.billing_cycle ?? "weekly") as "weekly" | "monthly" };
  });

export const setMyBillingCycle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ billing_cycle: z.enum(["weekly", "monthly"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/app-supabase/client.server");
    const { data: v } = await tbl(supabaseAdmin, "vendors")
      .select("id")
      .eq("owner_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!v) throw new Error("No partner profile found");
    const { error } = await tbl(supabaseAdmin, "vendors")
      .update({ billing_cycle: data.billing_cycle })
      .eq("id", (v as any).id);
    if (error) throw error;
    return { ok: true as const };
  });

// Group billing entries into weekly/monthly periods for the current partner (or a chosen partner if admin)
export const listBillingPeriods = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        scope: z.enum(["mine", "all"]).default("mine"),
        partner_id: z.string().uuid().optional(),
        cycle: z.enum(["weekly", "monthly"]).optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/app-supabase/client.server");
    const admin = await isAdmin(context);

    let partnerId: string | null = null;
    let cycle: "weekly" | "monthly" = data.cycle ?? "weekly";

    if (data.scope === "mine" || !admin) {
      const { data: v } = await tbl(supabaseAdmin, "vendors")
        .select("id, billing_cycle")
        .eq("owner_id", context.userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!v) return { cycle, periods: [] as any[] };
      partnerId = (v as any).id;
      if (!data.cycle) cycle = ((v as any).billing_cycle ?? "weekly") as any;
    } else if (data.partner_id) {
      partnerId = data.partner_id;
      if (!data.cycle) {
        const { data: v } = await tbl(supabaseAdmin, "vendors")
          .select("billing_cycle")
          .eq("id", partnerId)
          .maybeSingle();
        cycle = (((v as any)?.billing_cycle ?? "weekly")) as any;
      }
    } else {
      return { cycle, periods: [] as any[] };
    }

    const { data: rows, error } = await tbl(supabaseAdmin, "partner_billing_entries")
      .select("id, amount, status, created_at")
      .eq("partner_id", partnerId)
      .order("created_at", { ascending: false })
      .limit(2000);
    if (error) throw error;

    const keyOf = (iso: string) => {
      const d = new Date(iso);
      if (cycle === "monthly") {
        return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
      }
      // ISO week starting Monday (UTC)
      const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
      const day = t.getUTCDay() || 7;
      t.setUTCDate(t.getUTCDate() - day + 1); // Monday
      return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
    };

    const groups: Record<string, { period: string; count: number; total: number; unpaid: number; paid: number }> = {};
    for (const r of (rows ?? []) as any[]) {
      const k = keyOf(r.created_at);
      const g = (groups[k] = groups[k] ?? { period: k, count: 0, total: 0, unpaid: 0, paid: 0 });
      const amt = Number(r.amount);
      g.count += 1;
      g.total += amt;
      if (r.status === "unpaid") g.unpaid += amt;
      else if (r.status === "paid") g.paid += amt;
    }
    const periods = Object.values(groups).sort((a, b) => (a.period < b.period ? 1 : -1));
    return { cycle, periods };
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

// ---------------------------------------------------------------------------
// Bank details (kept on app_settings row 1)
// ---------------------------------------------------------------------------

const BANK_FIELDS = [
  "bank_name",
  "bank_account_name",
  "bank_account_number",
  "bank_branch",
  "bank_iban",
  "bank_swift",
  "bank_instructions",
] as const;

export const getBankSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/app-supabase/client.server");
    const { data, error } = await tbl(supabaseAdmin, "app_settings")
      .select(BANK_FIELDS.join(", "))
      .eq("id", 1)
      .maybeSingle();
    if (error) {
      // Migration not applied yet — return blank so UI still renders
      return Object.fromEntries(BANK_FIELDS.map((f) => [f, ""])) as Record<string, string>;
    }
    return Object.fromEntries(
      BANK_FIELDS.map((f) => [f, ((data as any)?.[f] ?? "") as string]),
    ) as Record<string, string>;
  });

export const saveBankSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        bank_name: z.string().max(120).optional().nullable(),
        bank_account_name: z.string().max(120).optional().nullable(),
        bank_account_number: z.string().max(60).optional().nullable(),
        bank_branch: z.string().max(120).optional().nullable(),
        bank_iban: z.string().max(60).optional().nullable(),
        bank_swift: z.string().max(30).optional().nullable(),
        bank_instructions: z.string().max(2000).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    if (!(await isAdmin(context))) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/app-supabase/client.server");
    const payload: Record<string, any> = {};
    for (const f of BANK_FIELDS) if (f in data) payload[f] = (data as any)[f] ?? null;
    const { error } = await tbl(supabaseAdmin, "app_settings").update(payload).eq("id", 1);
    if (error) throw error;
    return { ok: true as const };
  });

// ---------------------------------------------------------------------------
// Partner submits a payment receipt for admin verification
// ---------------------------------------------------------------------------

export const submitPartnerPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        amount: z.number().positive(),
        receipt_url: z.string().url(),
        reference: z.string().max(120).optional().nullable(),
        note: z.string().max(500).optional().nullable(),
        period_key: z.string().max(20).optional().nullable(),
        cycle: z.enum(["weekly", "monthly"]).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/app-supabase/client.server");
    const { data: v } = await tbl(supabaseAdmin, "vendors")
      .select("id, billing_cycle, store_name")
      .eq("owner_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!v) throw new Error("No partner profile found");
    const cycle = (data.cycle ?? (v as any).billing_cycle ?? "weekly") as "weekly" | "monthly";
    const { error } = await tbl(supabaseAdmin, "partner_payments").insert({
      partner_id: (v as any).id,
      amount: data.amount,
      note: data.note ?? null,
      reference: data.reference ?? null,
      receipt_url: data.receipt_url,
      period_key: data.period_key ?? null,
      cycle,
      status: "pending",
      submitted_by: context.userId,
    });
    if (error) throw error;
    return { ok: true as const };
  });

export const reviewPartnerPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        payment_id: z.string().uuid(),
        action: z.enum(["verify", "reject"]),
        rejected_reason: z.string().max(500).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    if (!(await isAdmin(context))) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/app-supabase/client.server");
    const { data: p, error: fetchErr } = await tbl(supabaseAdmin, "partner_payments")
      .select("id, partner_id, amount, status, period_key, cycle")
      .eq("id", data.payment_id)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!p) throw new Error("Payment not found");
    if (data.action === "reject") {
      const { error } = await tbl(supabaseAdmin, "partner_payments")
        .update({
          status: "rejected",
          rejected_reason: data.rejected_reason ?? null,
          verified_by: context.userId,
          verified_at: new Date().toISOString(),
        })
        .eq("id", data.payment_id);
      if (error) throw error;
      return { ok: true as const };
    }
    // verify → mark verified + apply against unpaid entries oldest-first
    const { error: upErr } = await tbl(supabaseAdmin, "partner_payments")
      .update({
        status: "verified",
        verified_by: context.userId,
        verified_at: new Date().toISOString(),
      })
      .eq("id", data.payment_id);
    if (upErr) throw upErr;

    const { data: unpaid } = await tbl(supabaseAdmin, "partner_billing_entries")
      .select("id, amount")
      .eq("partner_id", (p as any).partner_id)
      .eq("status", "unpaid")
      .order("created_at", { ascending: true });
    let remaining = Number((p as any).amount);
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

export const setPartnerBillingCycle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ partner_id: z.string().uuid(), billing_cycle: z.enum(["weekly", "monthly"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    if (!(await isAdmin(context))) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/app-supabase/client.server");
    const { error } = await tbl(supabaseAdmin, "vendors")
      .update({ billing_cycle: data.billing_cycle })
      .eq("id", data.partner_id);
    if (error) throw error;
    return { ok: true as const };
  });

// ---------------------------------------------------------------------------
// Invoice for a specific billing period
// ---------------------------------------------------------------------------

function periodKeyOf(iso: string, cycle: "weekly" | "monthly"): string {
  const d = new Date(iso);
  if (cycle === "monthly") {
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() - day + 1);
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
}

export const getInvoicePeriod = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        partner_id: z.string().uuid().optional(),
        cycle: z.enum(["weekly", "monthly"]),
        period_key: z.string().min(4).max(20),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/app-supabase/client.server");
    const admin = await isAdmin(context);
    let partnerId = data.partner_id ?? null;
    if (!admin || !partnerId) {
      const { data: v } = await tbl(supabaseAdmin, "vendors")
        .select("id")
        .eq("owner_id", context.userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!v) throw new Error("No partner profile found");
      partnerId = (v as any).id;
    }

    const [{ data: partner }, { data: settings }] = await Promise.all([
      tbl(supabaseAdmin, "vendors")
        .select("id, store_name, address, contact_phone, contact_email")
        .eq("id", partnerId)
        .maybeSingle(),
      tbl(supabaseAdmin, "app_settings")
        .select("site_name, contact_email, contact_phone, logo_url, " + BANK_FIELDS.join(", "))
        .eq("id", 1)
        .maybeSingle(),
    ]);

    const { data: entries, error: entriesErr } = await tbl(supabaseAdmin, "partner_billing_entries")
      .select("id, order_id, amount, status, created_at")
      .eq("partner_id", partnerId)
      .order("created_at", { ascending: true });
    if (entriesErr) throw entriesErr;

    const filtered = (entries ?? []).filter(
      (e: any) => periodKeyOf(e.created_at, data.cycle) === data.period_key,
    );
    const orderIds = filtered.map((e: any) => e.order_id);
    let orders: any[] = [];
    if (orderIds.length > 0) {
      const { data: os } = await tbl(supabaseAdmin, "orders")
        .select("id, tracking_no, delivery_address, customer_name, customer_phone, total, status, created_at")
        .in("id", orderIds);
      orders = (os ?? []) as any[];
    }
    const orderMap = new Map(orders.map((o: any) => [o.id, o]));
    const lines = filtered.map((e: any) => ({
      entry_id: e.id,
      amount: Number(e.amount),
      status: e.status,
      created_at: e.created_at,
      order: orderMap.get(e.order_id) ?? null,
    }));
    const total = lines.reduce((s: number, l: { amount: number }) => s + l.amount, 0);

    // Payments associated with this period_key (or all in period range for legacy)
    const { data: pays } = await tbl(supabaseAdmin, "partner_payments")
      .select("id, amount, status, reference, receipt_url, created_at, period_key, cycle")
      .eq("partner_id", partnerId)
      .order("created_at", { ascending: false });
    const payments = ((pays ?? []) as any[]).filter(
      (p) => !p.period_key || p.period_key === data.period_key,
    );
    const paidTotal = payments
      .filter((p: any) => p.status === "verified")
      .reduce((s: number, p: any) => s + Number(p.amount), 0);

    return {
      partner,
      settings,
      cycle: data.cycle,
      period_key: data.period_key,
      lines,
      total,
      payments,
      paid_total: paidTotal,
      balance: Math.max(0, total - paidTotal),
    };
  });