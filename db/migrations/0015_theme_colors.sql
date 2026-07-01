-- Migration 0015 — extended color scheme controls for the whole system.

ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS background_color text,
  ADD COLUMN IF NOT EXISTS foreground_color text,
  ADD COLUMN IF NOT EXISTS card_color text,
  ADD COLUMN IF NOT EXISTS muted_color text,
  ADD COLUMN IF NOT EXISTS border_color text,
  ADD COLUMN IF NOT EXISTS theme_mode text NOT NULL DEFAULT 'light';

NOTIFY pgrst, 'reload schema';