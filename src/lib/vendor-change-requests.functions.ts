import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/app-supabase/auth-middleware";
import { loadEmailSettings, sendViaResend } from "./email.functions";

const FIELDS = [
  "store_name",
  "description",
  "cuisine",
  "phone",
  "address",
  "logo_url",
  "cover_url",
] as const;

const ChangesSchema = z
  .object({
    store_name: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    cuisine: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),
    address: z.string().nullable().optional(),
    logo_url: z.string().nullable().optional(),
    cover_url: z.string().nullable().optional(),
  })
  .passthrough();

function escapeHtml(s: unknown): string {
  return String(s ?? "—")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function diffRows(before: Record<string, any>, after: Record<string, any>) {
  const rows: { field: string; before: any; after: any }[] = [];
  for (const f of FIELDS) {
    if (!(f in after)) continue;
    const a = before?.[f] ?? null;
    const b = after[f] ?? null;
    if ((a ?? "") !== (b ?? "")) rows.push({ field: f, before: a, after: b });
  }
  return rows;
}

function diffTableHtml(rows: { field: string; before: any; after: any }[]) {
  if (rows.length === 0) return "<p>No field changes detected.</p>";
  const body = rows
    .map(
      (r) => `<tr>
        <td style="padding:6px 10px;border:1px solid #e5e7eb;font-weight:600;text-transform:capitalize">${escapeHtml(
          r.field.replace(/_/g, " "),
        )}</td>
        <td style="padding:6px 10px;border:1px solid #e5e7eb;color:#991b1b">${escapeHtml(r.before)}</td>
        <td style="padding:6px 10px;border:1px solid #e5e7eb;color:#065f46">${escapeHtml(r.after)}</td>
      </tr>`,
    )
    .join("");
  return `<table style="border-collapse:collapse;font-family:system-ui,sans-serif;font-size:14px;width:100%">
    <thead><tr style="background:#f9fafb">
      <th style="padding:6px 10px;border:1px solid #e5e7eb;text-align:left">Field</th>
      <th style="padding:6px 10px;border:1px solid #e5e7eb;text-align:left">Before</th>
      <th style="padding:6px 10px;border:1px solid #e5e7eb;text-align:left">After</th>
    </tr></thead><tbody>${body}</tbody></table>`;
}

async function notify(opts: {
  to: string[];
  subject: string;
  intro: string;
  vendorName: string;
  rows: { field: string; before: any; after: any }[];
  footer?: string;
}) {
  const recipients = Array.from(new Set(opts.to.filter(Boolean)));
  if (recipients.length === 0) return;
  const html = `<div style="font-family:system-ui,sans-serif;font-size:14px;color:#111827">
    <h2 style="margin:0 0 8px">${escapeHtml(opts.subject)}</h2>
    <p style="margin:0 0 12px">${opts.intro}</p>
    <p style="margin:0 0 8px"><strong>Vendor:</strong> ${escapeHtml(opts.vendorName)}</p>
    ${diffTableHtml(opts.rows)}
    ${opts.footer ? `<p style="margin-top:14px">${opts.footer}</p>` : ""}
  </div>`;
  await sendViaResend({ to: recipients, subject: opts.subject, html }).catch(() => {});
}

const SubmitInput = z.object({
  vendor_id: z.string().uuid(),
  changes: ChangesSchema,
});

const SaveBusinessSettingsInput = z.object({
  vendor_id: z.string().uuid(),
  is_open: z.boolean(),
  changes: ChangesSchema,
});

export const getMyVendorBusinessSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/app-supabase/client.server");

    const { data: vendor, error } = await supabaseAdmin
      .from("vendors")
      .select("id, store_name, description, cuisine, phone, address, logo_url, cover_url, is_open")
      .eq("owner_id", context.userId)
      .maybeSingle();
    if (error) throw error;
    if (!vendor) return { vendor: null, pending: null };

    const { data: pending, error: pendingError } = await (supabaseAdmin
      .from("vendor_change_requests" as any) as any)
      .select("*")
      .eq("vendor_id", (vendor as any).id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (pendingError) throw pendingError;

    return { vendor, pending: pending ?? null };
  });

export const listVendorChangeRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
    if (!isAdmin) throw new Error("Forbidden: admin only");
    const { supabaseAdmin } = await import("@/integrations/app-supabase/client.server");

    const { data, error } = await (supabaseAdmin
      .from("vendor_change_requests" as any) as any)
      .select("*, vendors(store_name)")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as any[];
  });

export const saveVendorBusinessSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => SaveBusinessSettingsInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/app-supabase/client.server");

    const { data: vendor, error: vErr } = await supabaseAdmin
      .from("vendors")
      .select("id, owner_id, store_name, description, cuisine, phone, address, logo_url, cover_url, is_open")
      .eq("id", data.vendor_id)
      .maybeSingle();
    if (vErr) throw vErr;
    if (!vendor || (vendor as any).owner_id !== context.userId) throw new Error("Forbidden");

    const { error: openErr } = await supabaseAdmin
      .from("vendors")
      .update({ is_open: data.is_open })
      .eq("id", data.vendor_id);
    if (openErr) throw openErr;

    const rows = diffRows(vendor as any, data.changes);
    if (rows.length === 0) {
      return { ok: true as const, pending: null, changedFields: 0 };
    }

    const { data: existingPending, error: pendingErr } = await (supabaseAdmin
      .from("vendor_change_requests" as any) as any)
      .select("id")
      .eq("vendor_id", data.vendor_id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (pendingErr) throw pendingErr;

    const write = existingPending
      ? (supabaseAdmin.from("vendor_change_requests" as any) as any)
          .update({ changes: data.changes, requested_by: context.userId })
          .eq("id", (existingPending as any).id)
      : (supabaseAdmin.from("vendor_change_requests" as any) as any).insert({
          vendor_id: data.vendor_id,
          requested_by: context.userId,
          changes: data.changes,
        });

    const { data: inserted, error } = await write.select().single();
    if (error) throw error;

    const { data: vendorEmail } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .eq("id", context.userId)
      .maybeSingle();
    const settings = await loadEmailSettings();
    const adminTo = settings?.admin_notification_email;
    const vendorName = (vendor as any).store_name ?? "Vendor";

    await notify({
      to: [adminTo ?? "", (vendorEmail as any)?.email ?? ""].filter(Boolean) as string[],
      subject: `Change request submitted — ${vendorName}`,
      intro: "A vendor submitted a business-info change request awaiting admin review.",
      vendorName,
      rows,
      footer: "Review in Admin → Vendor change requests.",
    });

    return { ok: true as const, pending: inserted, changedFields: rows.length };
  });

export const submitVendorChangeRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => SubmitInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/app-supabase/client.server");

    // Confirm caller owns the vendor.
    const { data: vendor, error: vErr } = await supabaseAdmin
      .from("vendors")
      .select("id, owner_id, store_name, store_name, description, cuisine, phone, address, logo_url, cover_url")
      .eq("id", data.vendor_id)
      .maybeSingle();
    if (vErr) throw vErr;
    if (!vendor || (vendor as any).owner_id !== context.userId) throw new Error("Forbidden");

    const { data: inserted, error } = await (supabaseAdmin
      .from("vendor_change_requests" as any) as any)
      .insert({
        vendor_id: data.vendor_id,
        requested_by: context.userId,
        changes: data.changes,
      })
      .select()
      .single();
    if (error) throw error;

    // Email admin + vendor with the diff.
    const settings = await loadEmailSettings();
    const adminTo = settings?.admin_notification_email;
    const { data: vendorEmail } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .eq("id", context.userId)
      .maybeSingle();
    const rows = diffRows(vendor as any, data.changes);
    const vendorName = (vendor as any).store_name ?? "Vendor";

    await notify({
      to: [adminTo ?? "", (vendorEmail as any)?.email ?? ""].filter(Boolean) as string[],
      subject: `Change request submitted — ${vendorName}`,
      intro: "A vendor submitted a business-info change request awaiting admin review.",
      vendorName,
      rows,
      footer: "Review in Admin → Vendor change requests.",
    });

    return { ok: true as const, id: (inserted as any).id };
  });

const ReviewInput = z.object({
  request_id: z.string().uuid(),
  approve: z.boolean(),
  admin_note: z.string().nullable().optional(),
});

export const reviewVendorChangeRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => ReviewInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/app-supabase/client.server");
    const { data: isAdmin } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
    if (!isAdmin) throw new Error("Forbidden: admin only");

    const { data: req, error: rErr } = await (supabaseAdmin
      .from("vendor_change_requests" as any) as any)
      .select("*")
      .eq("id", data.request_id)
      .maybeSingle();
    if (rErr) throw rErr;
    if (!req) throw new Error("Request not found");
    if ((req as any).status !== "pending") throw new Error("Request already reviewed");

    const { data: vendor, error: vErr } = await supabaseAdmin
      .from("vendors")
      .select("id, owner_id, store_name, description, cuisine, phone, address, logo_url, cover_url")
      .eq("id", (req as any).vendor_id)
      .maybeSingle();
    if (vErr) throw vErr;
    if (!vendor) throw new Error("Vendor not found");

    const changes = (req as any).changes as Record<string, any>;
    const rows = diffRows(vendor as any, changes);

    if (data.approve) {
      const { error: uErr } = await (supabaseAdmin.from("vendors") as any)
        .update(changes)
        .eq("id", (vendor as any).id);
      if (uErr) throw uErr;
    }

    const { error: stErr } = await (supabaseAdmin
      .from("vendor_change_requests" as any) as any)
      .update({
        status: data.approve ? "approved" : "rejected",
        admin_note: data.admin_note ?? null,
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", data.request_id);
    if (stErr) throw stErr;

    const settings = await loadEmailSettings();
    const adminTo = settings?.admin_notification_email;
    const { data: vendorEmail } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .eq("id", (vendor as any).owner_id)
      .maybeSingle();
    const vendorName = (vendor as any).store_name ?? "Vendor";
    const verb = data.approve ? "approved and applied" : "rejected";

    await notify({
      to: [adminTo ?? "", (vendorEmail as any)?.email ?? ""].filter(Boolean) as string[],
      subject: `Change request ${data.approve ? "approved" : "rejected"} — ${vendorName}`,
      intro: `The following change request was <strong>${verb}</strong>.`,
      vendorName,
      rows,
      footer: data.admin_note ? `<strong>Admin note:</strong> ${escapeHtml(data.admin_note)}` : undefined,
    });

    return { ok: true as const };
  });