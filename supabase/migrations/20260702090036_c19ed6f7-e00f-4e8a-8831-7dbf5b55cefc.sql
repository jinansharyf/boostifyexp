ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS sms_tpl_picked TEXT,
  ADD COLUMN IF NOT EXISTS sms_tpl_on_the_way TEXT,
  ADD COLUMN IF NOT EXISTS sms_tpl_delivered TEXT;

UPDATE public.app_settings
SET
  sms_tpl_picked = COALESCE(sms_tpl_picked, 'Hi {customer}, your order #{tracking} has been picked up and is on the way. Track: {link}'),
  sms_tpl_on_the_way = COALESCE(sms_tpl_on_the_way, 'Hi {customer}, your order #{tracking} is on the way to you. Track: {link}'),
  sms_tpl_delivered = COALESCE(sms_tpl_delivered, 'Hi {customer}, your order #{tracking} has been delivered. Thank you! Track: {link}')
WHERE id = 1;

NOTIFY pgrst, 'reload schema';