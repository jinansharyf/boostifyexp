import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/app-supabase/auth-middleware";

const UploadImageInput = z.object({
  bucket: z.enum(["avatars", "vendor-assets"]),
  path: z.string().min(1).max(500),
  contentType: z.string().regex(/^image\//),
  base64: z.string().min(1),
});

function base64ToBlob(base64: string, contentType: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: contentType });
}

export const uploadImageFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => UploadImageInput.parse(i))
  .handler(async ({ data, context }) => {
    if (data.base64.length > 7_000_000) throw new Error("Max 5 MB.");
    if (data.path.includes("..") || data.path.startsWith("/") || data.path.endsWith("/")) {
      throw new Error("Invalid upload path");
    }

    const folder = data.path.split("/")[0];
    const { supabaseAdmin } = await import("@/integrations/app-supabase/client.server");

    if (data.bucket === "avatars") {
      if (folder !== context.userId) throw new Error("Forbidden");
    } else if (data.bucket === "vendor-assets") {
      const { data: vendor, error } = await supabaseAdmin
        .from("vendors")
        .select("id, owner_id")
        .eq("id", folder)
        .maybeSingle();
      if (error) throw error;
      if (!vendor || (vendor as any).owner_id !== context.userId) throw new Error("Forbidden");
    }

    const blob = base64ToBlob(data.base64, data.contentType);
    const { error } = await supabaseAdmin.storage.from(data.bucket).upload(data.path, blob, {
      upsert: true,
      contentType: data.contentType,
    });
    if (error) throw error;

    const { data: url } = supabaseAdmin.storage.from(data.bucket).getPublicUrl(data.path);
    return { publicUrl: url.publicUrl };
  });