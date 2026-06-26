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

export function SystemSettingsProvider({ children }: { children: ReactNode }) {
  const { data } = useQuery({
    queryKey: ["system-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_settings")
        .select(
          "site_name, tagline, logo_url, favicon_url, og_image_url, primary_color, accent_color, heading_font, body_font",
        )
        .eq("id", 1)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as SystemSettings | null;
    },
    staleTime: 60_000,
  });

  const settings = useMemo<SystemSettings>(() => ({ ...DEFAULTS, ...(data ?? {}) }), [data]);

  useEffect(() => {
    const root = document.documentElement;
    if (settings.primary_color) {
      root.style.setProperty("--primary", settings.primary_color);
      root.style.setProperty("--ring", settings.primary_color);
      root.style.setProperty("--mint", settings.primary_color);
      root.style.setProperty("--sidebar-primary", settings.primary_color);
      root.style.setProperty("--sidebar-ring", settings.primary_color);
      setThemeColor(settings.primary_color);
    }
    if (settings.accent_color) {
      root.style.setProperty("--bolt", settings.accent_color);
    }
    setFavicon(settings.favicon_url || settings.logo_url || boostifyLogo.url);
    if (settings.site_name) document.title = settings.site_name;
  }, [settings.primary_color, settings.accent_color, settings.favicon_url, settings.logo_url, settings.site_name]);

  return <Ctx.Provider value={settings}>{children}</Ctx.Provider>;
}
