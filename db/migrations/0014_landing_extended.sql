-- Migration 0014 — extra editable landing sections (showcase / partners / footer tagline)

ALTER TABLE public.landing_content
  ADD COLUMN IF NOT EXISTS showcase_title text,
  ADD COLUMN IF NOT EXISTS showcase_subtitle text,
  ADD COLUMN IF NOT EXISTS partners_title text,
  ADD COLUMN IF NOT EXISTS partners_subtitle text,
  ADD COLUMN IF NOT EXISTS show_partners boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS footer_tagline text;

NOTIFY pgrst, 'reload schema';