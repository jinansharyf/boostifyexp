-- Staff notification channel: personal Telegram chat ID
ALTER TABLE public.staff_members
  ADD COLUMN IF NOT EXISTS telegram_chat_id text;

-- Make sure orders are broadcast on realtime so staff can hear inserts
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';