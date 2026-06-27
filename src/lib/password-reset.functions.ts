import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { sendViaResend } from "./email.functions";

const ResetInput = z.object({
  email: z.string().email(),
  redirectOrigin: z.string().url().optional(),
});

const COOLDOWN_MS = 60_000;
const memoryRateLimit = new Map<string, number>();

export const requestPasswordResetEmail = createServerFn({ method: "POST" })
  .inputValidator((input) => ResetInput.parse(input))
  .handler(async ({ data }) => {
    const email = data.email.trim().toLowerCase();
    const origin = getSafeOrigin(data.redirectOrigin);

    await enforceRateLimit(email);

    const { supabaseAdmin } = await import("@/integrations/app-supabase/client.server");
    const { data: linkData, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email,
    });

    if (error) {
      const msg = String(error.message ?? "").toLowerCase();
      if (msg.includes("not found") || msg.includes("no user")) return { ok: true as const };
      throw error;
    }

    const props = (linkData?.properties ?? {}) as Record<string, string | undefined>;
    const resetUrl = props.hashed_token
      ? `${origin}/reset-password?token_hash=${encodeURIComponent(props.hashed_token)}&type=recovery`
      : props.action_link;

    if (!resetUrl) throw new Error("Could not create a password reset link.");

    const sent = await sendViaResend({
      to: email,
      subject: "Reset your Boostify password",
      html: passwordResetHtml(resetUrl),
    });
    if (!sent.ok) throw new Error(sent.error);

    return { ok: true as const };
  });

function getSafeOrigin(requestedOrigin?: string) {
  const request = getRequest();
  const originHeader = request?.headers.get("origin");
  const referer = request?.headers.get("referer");
  const baseOrigin = originHeader || (referer ? new URL(referer).origin : requestedOrigin);
  if (!baseOrigin) throw new Error("Could not determine app URL for the reset link.");

  const origin = new URL(baseOrigin).origin;
  if (requestedOrigin && new URL(requestedOrigin).origin !== origin) {
    throw new Error("Invalid reset link origin.");
  }
  return origin;
}

async function enforceRateLimit(email: string) {
  const now = Date.now();
  try {
    const { supabaseAdmin } = await import("@/integrations/app-supabase/client.server");
    const { data, error } = await (supabaseAdmin.from("password_reset_requests" as any) as any)
      .select("email, last_sent_at, request_count")
      .eq("email", email)
      .maybeSingle();

    if (error) throw error;

    const lastSent = data?.last_sent_at ? new Date(data.last_sent_at).getTime() : 0;
    const remaining = COOLDOWN_MS - (now - lastSent);
    if (remaining > 0) {
      throw new Error(`Please wait ${Math.ceil(remaining / 1000)}s before requesting another email.`);
    }

    const { error: upsertError } = await (supabaseAdmin.from("password_reset_requests" as any) as any).upsert(
      {
        email,
        last_sent_at: new Date(now).toISOString(),
        request_count: Number(data?.request_count ?? 0) + 1,
        updated_at: new Date(now).toISOString(),
      },
      { onConflict: "email" },
    );
    if (upsertError) throw upsertError;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.toLowerCase().includes("please wait")) throw err;

    const last = memoryRateLimit.get(email) ?? 0;
    const remaining = COOLDOWN_MS - (now - last);
    if (remaining > 0) {
      throw new Error(`Please wait ${Math.ceil(remaining / 1000)}s before requesting another email.`);
    }
    memoryRateLimit.set(email, now);
  }
}

function passwordResetHtml(resetUrl: string) {
  return `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#17202a;max-width:560px;margin:0 auto;padding:24px;">
      <h1 style="font-size:24px;margin:0 0 12px;">Reset your password</h1>
      <p>We received a request to reset your Boostify account password.</p>
      <p style="margin:28px 0;">
        <a href="${resetUrl}" style="background:#111827;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:999px;font-weight:700;display:inline-block;">
          Set a new password
        </a>
      </p>
      <p>If the button does not work, copy and paste this link into your browser:</p>
      <p style="word-break:break-all;"><a href="${resetUrl}">${resetUrl}</a></p>
      <p>This link expires soon. If you did not request it, you can ignore this email.</p>
      <p>— The Boostify team</p>
    </div>
  `;
}