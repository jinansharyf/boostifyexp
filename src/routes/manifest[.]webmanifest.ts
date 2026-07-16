import { createFileRoute } from "@tanstack/react-router";

const FALLBACK_ICON = "/boostify-logo.png";
const LEGACY_LOVABLE_LOGO =
  "/__l5e/assets-v1/8a7ec683-440e-4754-9047-33cb3e6257df/boostify-logo.png";

function resolveIcon(url: string | null | undefined): string {
  if (
    !url ||
    url === LEGACY_LOVABLE_LOGO ||
    (url.startsWith("/__l5e/") && url.includes("boostify-logo.png"))
  ) {
    return FALLBACK_ICON;
  }
  return url;
}

export const Route = createFileRoute("/manifest.webmanifest")({
  server: {
    handlers: {
      GET: async () => {
        let name = "Boostify";
        let icon = FALLBACK_ICON;
        let theme = "#2dd4a8";
        try {
          const { supabaseAdmin } = await import("@/integrations/app-supabase/client.server");
          const { data } = await supabaseAdmin
            .from("app_settings")
            .select("site_name, logo_url, pwa_icon_url, primary_color")
            .eq("id", 1)
            .maybeSingle();
          const row = (data ?? {}) as {
            site_name?: string | null;
            logo_url?: string | null;
            pwa_icon_url?: string | null;
            primary_color?: string | null;
          };
          if (row.site_name) name = row.site_name;
          if (row.pwa_icon_url) icon = resolveIcon(row.pwa_icon_url);
          else if (row.logo_url) icon = resolveIcon(row.logo_url);
          if (row.primary_color) theme = row.primary_color;
        } catch {
          // fall through to defaults
        }
        const manifest = {
          name,
          short_name: name,
          description: `${name} partner & ops platform`,
          start_url: "/",
          scope: "/",
          display: "standalone",
          background_color: "#ffffff",
          theme_color: theme,
          icons: [
            { src: icon, sizes: "192x192", type: "image/png", purpose: "any" },
            { src: icon, sizes: "512x512", type: "image/png", purpose: "any" },
            { src: icon, sizes: "512x512", type: "image/png", purpose: "maskable" },
          ],
        };
        return new Response(JSON.stringify(manifest), {
          headers: {
            "content-type": "application/manifest+json; charset=utf-8",
            "cache-control": "public, max-age=60",
          },
        });
      },
    },
  },
});
