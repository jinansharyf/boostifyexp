ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS sms_enabled_picked boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sms_enabled_on_the_way boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sms_enabled_delivered boolean NOT NULL DEFAULT true;
NOTIFY pgrst, 'reload schema';