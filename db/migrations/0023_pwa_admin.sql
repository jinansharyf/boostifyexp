-- PWA branding (admin-configurable icon and install prompt copy).
-- Safe to re-run.

ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS pwa_icon_url text;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS pwa_install_title text;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS pwa_install_body_android text;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS pwa_install_body_ios text;

NOTIFY pgrst, 'reload schema';