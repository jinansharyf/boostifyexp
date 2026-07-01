ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT;
NOTIFY pgrst, 'reload schema';