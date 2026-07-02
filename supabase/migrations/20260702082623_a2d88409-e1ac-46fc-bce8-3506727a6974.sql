-- Add SMS + public URL settings to app_settings
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS public_url TEXT,
  ADD COLUMN IF NOT EXISTS sms_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sms_api_key TEXT,
  ADD COLUMN IF NOT EXISTS sms_api_url TEXT,
  ADD COLUMN IF NOT EXISTS sms_sender_id TEXT;

NOTIFY pgrst, 'reload schema';