-- Boostify: Business Partner Applications
-- Apply this in your Supabase project SQL editor AFTER db/schema_clean.sql.
-- Safe to run more than once.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'partner_application_status' AND typnamespace = 'public'::regnamespace) THEN
    CREATE TYPE public.partner_application_status AS ENUM ('pending', 'approved', 'rejected');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.partner_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_name text NOT NULL,
  applicant_email text NOT NULL,
  applicant_phone text NOT NULL,
  store_name text NOT NULL,
  cuisine text,
  address text,
  zone_id uuid,
  notes text,
  status public.partner_application_status NOT NULL DEFAULT 'pending',
  review_notes text,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  approved_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_vendor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Add optional foreign keys only when the base tables already exist.
-- This keeps the migration runnable even if your base schema was only partially applied.
DO $$
BEGIN
  IF to_regclass('public.zones') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'partner_applications_zone_id_fkey') THEN
    ALTER TABLE public.partner_applications
      ADD CONSTRAINT partner_applications_zone_id_fkey
      FOREIGN KEY (zone_id) REFERENCES public.zones(id) ON DELETE SET NULL;
  END IF;

  IF to_regclass('public.vendors') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'partner_applications_approved_vendor_id_fkey') THEN
    ALTER TABLE public.partner_applications
      ADD CONSTRAINT partner_applications_approved_vendor_id_fkey
      FOREIGN KEY (approved_vendor_id) REFERENCES public.vendors(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS partner_applications_status_idx ON public.partner_applications(status, created_at DESC);

GRANT SELECT, INSERT ON public.partner_applications TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_applications TO authenticated;
GRANT ALL ON public.partner_applications TO service_role;

ALTER TABLE public.partner_applications ENABLE ROW LEVEL SECURITY;

-- Anyone (including unauthenticated public) can submit a new application.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'partner_applications' AND policyname = 'Anyone can submit a partner application') THEN
    CREATE POLICY "Anyone can submit a partner application"
      ON public.partner_applications FOR INSERT
      TO anon, authenticated
      WITH CHECK (status = 'pending');
  END IF;
END $$;

-- Only admins can read / review applications.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'partner_applications' AND policyname = 'Admins can read all applications') THEN
    CREATE POLICY "Admins can read all applications"
      ON public.partner_applications FOR SELECT
      TO authenticated
      USING (public.is_admin(auth.uid()));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'partner_applications' AND policyname = 'Admins can update applications') THEN
    CREATE POLICY "Admins can update applications"
      ON public.partner_applications FOR UPDATE
      TO authenticated
      USING (public.is_admin(auth.uid()))
      WITH CHECK (public.is_admin(auth.uid()));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'partner_applications' AND policyname = 'Admins can delete applications') THEN
    CREATE POLICY "Admins can delete applications"
      ON public.partner_applications FOR DELETE
      TO authenticated
      USING (public.is_admin(auth.uid()));
  END IF;
END $$;

DROP TRIGGER IF EXISTS partner_applications_set_updated_at ON public.partner_applications;
CREATE TRIGGER partner_applications_set_updated_at
  BEFORE UPDATE ON public.partner_applications
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
