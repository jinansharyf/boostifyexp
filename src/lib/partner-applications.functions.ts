import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/app-supabase/auth-middleware";

const ApproveInput = z.object({
  application_id: z.string().uuid(),
  temporary_password: z.string().min(8),
});

const RejectInput = z.object({
  application_id: z.string().uuid(),
  review_notes: z.string().max(500).optional(),
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
    if (userErr) throw userErr;
    const newUser = created.user!;

    // Trigger seeds profile + role; force role to vendor.
    await supabaseAdmin.from("user_roles").delete().eq("user_id", newUser.id);
    await supabaseAdmin.from("user_roles").insert({ user_id: newUser.id, role: "vendor" });

    // 2. Create vendor row.
    const { data: vendor, error: venErr } = await supabaseAdmin
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
