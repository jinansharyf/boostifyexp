ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS sms_tpl_picked TEXT;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS sms_tpl_on_the_way TEXT;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS sms_tpl_delivered TEXT;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS sms_enabled_picked BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS sms_enabled_on_the_way BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS sms_enabled_delivered BOOLEAN NOT NULL DEFAULT TRUE;
NOTIFY pgrst, 'reload schema';