-- =============================================================
-- Boostify — run this whole file in Supabase SQL editor.
-- Adds:
--   1) PWA branding fields (icon + install prompt copy)
--   2) Ensures order-number generator uses DO prefix (idempotent)
--   3) staff_duty_logs table + policies (idempotent)
-- Safe to re-run.
-- =============================================================

-- 1) PWA branding ---------------------------------------------
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS pwa_icon_url text;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS pwa_install_title text;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS pwa_install_body_android text;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS pwa_install_body_ios text;

-- 2) Order number prefix fallback -----------------------------
-- Make sure the app_settings default prefix is 'DO' when unset.
UPDATE public.app_settings
SET order_no_prefix = 'DO'
WHERE id = 1
  AND (order_no_prefix IS NULL OR order_no_prefix = '' OR order_no_prefix = 'BST');

-- 3) staff_duty_logs (staff shift tracker) --------------------
CREATE TABLE IF NOT EXISTS public.staff_duty_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('on','off')),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.staff_duty_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.staff_duty_logs TO service_role;

ALTER TABLE public.staff_duty_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff see own duty logs" ON public.staff_duty_logs;
CREATE POLICY "staff see own duty logs"
  ON public.staff_duty_logs FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "staff insert own duty logs" ON public.staff_duty_logs;
CREATE POLICY "staff insert own duty logs"
  ON public.staff_duty_logs FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Refresh PostgREST so new columns/policies are visible immediately
NOTIFY pgrst, 'reload schema';