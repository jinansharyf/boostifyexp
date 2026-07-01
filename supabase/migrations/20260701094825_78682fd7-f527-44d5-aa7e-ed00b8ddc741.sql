CREATE TABLE IF NOT EXISTS public.telegram_settings (
  id INT PRIMARY KEY,
  bot_token TEXT,
  admin_chat_id TEXT,
  enabled BOOLEAN NOT NULL DEFAULT false,
  broadcast_chat_ids TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO public.telegram_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.telegram_settings ADD COLUMN IF NOT EXISTS broadcast_chat_ids TEXT;
GRANT SELECT, INSERT, UPDATE ON public.telegram_settings TO authenticated;
GRANT ALL ON public.telegram_settings TO service_role;
ALTER TABLE public.telegram_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "telegram admin read" ON public.telegram_settings;
CREATE POLICY "telegram admin read" ON public.telegram_settings FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
DROP POLICY IF EXISTS "telegram admin write" ON public.telegram_settings;
CREATE POLICY "telegram admin write" ON public.telegram_settings FOR UPDATE TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
NOTIFY pgrst, 'reload schema';