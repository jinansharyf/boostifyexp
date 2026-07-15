import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/app-supabase/client";
import boostifyLogo from "@/assets/boostify-logo.png.asset.json";

export type SystemSettings = {
  site_name: string;
  tagline: string | null;
  logo_url: string | null;
  favicon_url: string | null;
  og_image_url: string | null;
  primary_color: string;
  accent_color: string;
  heading_font: string;
  body_font: string;
  background_color: string | null;
  foreground_color: string | null;
  card_color: string | null;
  muted_color: string | null;
  border_color: string | null;
  theme_mode: "light" | "dark";
  pwa_icon_url: string | null;
  pwa_install_title: string | null;
  pwa_install_body_android: string | null;
  pwa_install_body_ios: string | null;
};

const DEFAULTS: SystemSettings = {
  site_name: "Boostify",
  tagline: null,
  logo_url: boostifyLogo.url,
  favicon_url: boostifyLogo.url,
  og_image_url: null,
  primary_color: "#5b189a",
  accent_color: "#c084fc",
  heading_font: "Geist",
  body_font: "Geist",
  background_color: null,
  foreground_color: null,
  card_color: null,
  muted_color: null,
  border_color: null,
  theme_mode: "light",
  pwa_icon_url: null,
  pwa_install_title: null,
  pwa_install_body_android: null,
  pwa_install_body_ios: null,
};

const Ctx = createContext<SystemSettings>(DEFAULTS);

export function useSystemSettings() {
  return useContext(Ctx);
}

function setFavicon(href: string) {
  if (typeof document === "undefined") return;
  const rels = ["icon", "shortcut icon", "apple-touch-icon"];
  for (const rel of rels) {
    let link = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
    if (!link) {
      link = document.createElement("link");
      link.rel = rel;
      document.head.appendChild(link);
    }
    link.href = href;
  }
}

function setThemeColor(color: string) {
  if (typeof document === "undefined") return;
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }
  meta.content = color;
}

// Pick black or white text for best contrast on a given hex color.
function contrastText(hex: string): string {
  const h = hex.replace("#", "");
  if (h.length !== 6) return "#ffffff";
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return lum > 0.6 ? "#0d0d0d" : "#ffffff";
}

export function SystemSettingsProvider({ children }: { children: ReactNode }) {
  const { data } = useQuery({
    queryKey: ["system-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_settings")
        .select(
          "site_name, tagline, logo_url, favicon_url, og_image_url, primary_color, accent_color, heading_font, body_font, background_color, foreground_color, card_color, muted_color, border_color, theme_mode, pwa_icon_url, pwa_install_title, pwa_install_body_android, pwa_install_body_ios",
        )
        .eq("id", 1)
        .maybeSingle();
      if (error) {
        // Older schemas may not have the extended color columns yet — fall back.
        const fallback = await supabase
          .from("app_settings")
          .select("site_name, tagline, logo_url, favicon_url, og_image_url, primary_color, accent_color, heading_font, body_font")
          .eq("id", 1)
          .maybeSingle();
        if (fallback.error) throw fallback.error;
        return (fallback.data ?? null) as SystemSettings | null;
      }
      return (data ?? null) as SystemSettings | null;
    },
    staleTime: 60_000,
  });

  const settings = useMemo<SystemSettings>(() => ({ ...DEFAULTS, ...(data ?? {}) }), [data]);

  useEffect(() => {
    const root = document.documentElement;
    // Dark/light class hint for any @custom-variant dark rules.
    root.classList.toggle("dark", settings.theme_mode === "dark");

    if (settings.primary_color) {
      root.style.setProperty("--primary", settings.primary_color);
      root.style.setProperty("--primary-foreground", contrastText(settings.primary_color));
      root.style.setProperty("--ring", settings.primary_color);
      root.style.setProperty("--mint", settings.primary_color);
      root.style.setProperty("--sidebar-primary", settings.primary_color);
      root.style.setProperty("--sidebar-ring", settings.primary_color);
      setThemeColor(settings.primary_color);
    }
    if (settings.accent_color) {
      root.style.setProperty("--accent", settings.accent_color);
      root.style.setProperty("--accent-foreground", contrastText(settings.accent_color));
      root.style.setProperty("--bolt", settings.accent_color);
    }
    if (settings.background_color) {
      root.style.setProperty("--background", settings.background_color);
    }
    if (settings.foreground_color) {
      root.style.setProperty("--foreground", settings.foreground_color);
    }
    if (settings.card_color) {
      root.style.setProperty("--card", settings.card_color);
      root.style.setProperty("--card-foreground", settings.foreground_color ?? contrastText(settings.card_color));
      root.style.setProperty("--popover", settings.card_color);
      root.style.setProperty("--popover-foreground", settings.foreground_color ?? contrastText(settings.card_color));
    }
    if (settings.muted_color) {
      root.style.setProperty("--muted", settings.muted_color);
      root.style.setProperty("--secondary", settings.muted_color);
    }
    if (settings.border_color) {
      root.style.setProperty("--border", settings.border_color);
      root.style.setProperty("--input", settings.border_color);
    }
    setFavicon(settings.favicon_url || settings.logo_url || boostifyLogo.url);
    if (settings.site_name) document.title = settings.site_name;
  }, [
    settings.primary_color,
    settings.accent_color,
    settings.background_color,
    settings.foreground_color,
    settings.card_color,
    settings.muted_color,
    settings.border_color,
    settings.theme_mode,
    settings.favicon_url,
    settings.logo_url,
    settings.site_name,
  ]);

  return <Ctx.Provider value={settings}>{children}</Ctx.Provider>;
}
