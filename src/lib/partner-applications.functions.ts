import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/app-supabase/auth-middleware";
import { sendViaResend, loadEmailSettings } from "./email.functions";
import { sendTelegram } from "./telegram.functions";

const ApproveInput = z.object({
  application_id: z.string().uuid(),
  temporary_password: z.string().min(8),
});

const RejectInput = z.object({
  application_id: z.string().uuid(),
  review_notes: z.string().max(500).optional(),
});

const SubmitInput = z.object({
  applicant_name: z.string().min(1).max(120),
  applicant_email: z.string().email(),
  applicant_phone: z.string().min(3).max(40),
  store_name: z.string().min(1).max(160),
  cuisine: z.string().max(80).nullable().optional(),
  address: z.string().max(400).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.rpc("is_admin", { _user_id: ctx.userId });
  if (!data) throw new Error("Forbidden: admin only");
}

export const listPartnerApplications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/app-supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("partner_applications" as any)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return (data ?? []) as any[];
  });

export const approvePartnerApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => ApproveInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/app-supabase/client.server");

    const { data: appRow, error: appErr } = await supabaseAdmin
      .from("partner_applications" as any)
      .select("*")
      .eq("id", data.application_id)
      .maybeSingle();
    if (appErr) throw appErr;
    if (!appRow) throw new Error("Application not found");
    const app = appRow as any;
    if (app.status !== "pending") throw new Error("Application already reviewed");

    // 1. Create auth user with vendor role + force password change.
    //    If an auth user already exists with this email, reuse it and reset
    //    the password instead of failing.
    let newUser: { id: string } | null = null;
    const { data: created, error: userErr } = await supabaseAdmin.auth.admin.createUser({
      email: app.applicant_email,
      password: data.temporary_password,
      email_confirm: true,
      user_metadata: {
        full_name: app.applicant_name,
        phone: app.applicant_phone,
        must_change_password: true,
        role: "vendor",
      },
    });
    if (userErr) {
      const msg = String((userErr as any)?.message ?? "").toLowerCase();
      const alreadyExists =
        msg.includes("already been registered") ||
        msg.includes("already registered") ||
        msg.includes("already exists") ||
        (userErr as any)?.code === "email_exists";
      if (!alreadyExists) throw userErr;

      // Find the existing user by email and reset their password.
      let existingId: string | null = null;
      for (let page = 1; page <= 20 && !existingId; page++) {
        const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers({
          page,
          perPage: 200,
        });
        if (listErr) throw listErr;
        const match = list.users.find(
          (u) => (u.email ?? "").toLowerCase() === String(app.applicant_email).toLowerCase(),
        );
        if (match) existingId = match.id;
        if (list.users.length < 200) break;
      }
      if (!existingId) throw new Error("Existing user lookup failed");

      const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(existingId, {
        password: data.temporary_password,
        email_confirm: true,
        user_metadata: {
          full_name: app.applicant_name,
          phone: app.applicant_phone,
          must_change_password: true,
          role: "vendor",
        },
      });
      if (updErr) throw updErr;
      newUser = { id: existingId };
    } else {
      newUser = created.user!;
    }

    // Trigger seeds profile + role; force role to vendor.
    await supabaseAdmin.from("user_roles").delete().eq("user_id", newUser.id);
    await supabaseAdmin.from("user_roles").insert({ user_id: newUser.id, role: "vendor" });
    await supabaseAdmin
      .from("profiles")
      .update({ must_change_password: true, full_name: app.applicant_name })
      .eq("id", newUser.id);

    // 2. Upsert vendor row — reuse an existing vendor for this owner instead
    //    of creating duplicates if the same person applies twice.
    const { data: existingVendor } = await supabaseAdmin
      .from("vendors")
      .select("id")
      .eq("owner_id", newUser.id)
      .maybeSingle();
    let vendor: { id: string };
    if (existingVendor) {
      const { data: updated, error: updErr } = await supabaseAdmin
        .from("vendors")
        .update({
          store_name: app.store_name,
          cuisine: app.cuisine,
          phone: app.applicant_phone,
          address: app.address,
          zone_id: app.zone_id,
          status: "approved",
        })
        .eq("id", existingVendor.id)
        .select("id")
        .single();
      if (updErr) throw updErr;
      vendor = updated as { id: string };
    } else {
      const { data: created, error: venErr } = await supabaseAdmin
        .from("vendors")
        .insert({
          owner_id: newUser.id,
          store_name: app.store_name,
          cuisine: app.cuisine,
          phone: app.applicant_phone,
          address: app.address,
          zone_id: app.zone_id,
          status: "approved",
        })
        .select("id")
        .single();
      if (venErr) throw venErr;
      vendor = created as { id: string };
    }

    // 3. Update application.
    await supabaseAdmin
      .from("partner_applications" as any)
      .update({
        status: "approved",
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
        approved_user_id: newUser.id,
        approved_vendor_id: vendor.id,
      })
      .eq("id", data.application_id);

    // Email the new partner their temp password (best-effort).
    try {
      const settings = await loadEmailSettings();
      if (settings?.resend_api_key && settings.email_from) {
        await sendViaResend({
          to: app.applicant_email,
          subject: "Your Boostify partner account is approved 🎉",
          html: `<p>Hi ${escapeHtml(app.applicant_name)},</p>
                 <p>Your application for <strong>${escapeHtml(app.store_name)}</strong> has been approved.</p>
                 <p>Sign in with this temporary password and you'll be asked to set a new one immediately:</p>
                 <p><strong>Email:</strong> ${escapeHtml(app.applicant_email)}<br/>
                    <strong>Temporary password:</strong> <code>${escapeHtml(data.temporary_password)}</code></p>
                 <p>— The Boostify team</p>`,
        });
      }
    } catch {
      // ignore email errors
    }

    return {
      ok: true as const,
      email: app.applicant_email,
      temporary_password: data.temporary_password,
    };
  });

export const rejectPartnerApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => RejectInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/app-supabase/client.server");
    const { error } = await supabaseAdmin
      .from("partner_applications" as any)
      .update({
        status: "rejected",
        review_notes: data.review_notes ?? null,
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", data.application_id);
    if (error) throw error;
    return { ok: true as const };
  });

/**
 * Public (unauthenticated) submission endpoint used by the vendor register page.
 * Inserts the application as service role, then fires confirmation + admin emails
 * via Resend. Email failures are swallowed so a misconfigured Resend never blocks
 * the application itself.
 */
export const submitPartnerApplication = createServerFn({ method: "POST" })
  .inputValidator((i) => SubmitInput.parse(i))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/app-supabase/client.server");
    const email = data.applicant_email.toLowerCase();

    // Prevent duplicate pending/approved applications for the same email.
    const { data: dupe } = await supabaseAdmin
      .from("partner_applications" as any)
      .select("id, status")
      .eq("applicant_email", email)
      .in("status", ["pending", "approved"])
      .maybeSingle();
    if (dupe) {
      throw new Error(
        (dupe as any).status === "approved"
          ? "An approved partner account already exists for this email. Please sign in instead."
          : "An application for this email is already pending review.",
      );
    }

    const { data: inserted, error } = await supabaseAdmin
      .from("partner_applications" as any)
      .insert({
        applicant_name: data.applicant_name.trim(),
        applicant_email: email,
        applicant_phone: data.applicant_phone.trim(),
        store_name: data.store_name.trim(),
        cuisine: data.cuisine?.trim() || null,
        address: data.address?.trim() || null,
        notes: data.notes?.trim() || null,
        status: "pending",
      })
      .select("id")
      .single();
    if (error) throw error;

    // Fire-and-forget emails. Don't fail the submission if Resend is not set up.
    try {
      const settings = await loadEmailSettings();
      if (settings?.resend_api_key && settings.email_from) {
        const safeName = escapeHtml(data.applicant_name);
        const safeStore = escapeHtml(data.store_name);

        // Confirmation to applicant
        await sendViaResend({
          to: email,
          subject: "We received your Boostify partner application",
          html: `<p>Hi ${safeName},</p>
                 <p>Thanks for applying to sell on Boostify with <strong>${safeStore}</strong>.
                 Our team reviews every application and will be in touch within 24 hours.</p>
                 <p>— The Boostify team</p>`,
        });

        // Notification to admin
        if (settings.admin_notification_email) {
          await sendViaResend({
            to: settings.admin_notification_email,
            subject: `New partner application: ${data.store_name}`,
            html: `<p>A new business just applied to join Boostify.</p>
                   <ul>
                     <li><strong>Store:</strong> ${safeStore}</li>
                     <li><strong>Contact:</strong> ${safeName} (${escapeHtml(email)})</li>
                     <li><strong>Phone:</strong> ${escapeHtml(data.applicant_phone)}</li>
                   </ul>
                   <p>Review it in the admin dashboard → Partner applications.</p>`,
          });
        }
      }
    } catch {
      // ignore email errors
    }

    // Telegram (best-effort)
    sendTelegram(
      `📥 <b>New partner application</b>\n` +
      `Store: ${data.store_name}\n` +
      `Contact: ${data.applicant_name}\n` +
      `Email: ${email}\n` +
      `Phone: ${data.applicant_phone}`
    ).catch(() => {});

    return { ok: true as const, id: (inserted as any).id };
  });

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
