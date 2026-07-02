-- Adds public site URL + SMS (Owl-compatible) settings to app_settings.
-- Safe to re-run.

ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS public_url text;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS sms_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS sms_api_key text;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS sms_api_url text;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS sms_sender_id text;

NOTIFY pgrst, 'reload schema';