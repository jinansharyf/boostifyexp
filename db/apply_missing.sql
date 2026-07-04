-- =============================================================
-- Boostify: apply-all migrations (idempotent)
-- Run this AFTER db/setup.sql on a fresh Supabase project.
-- Safe to re-run: uses IF NOT EXISTS / DROP ... IF EXISTS / DO blocks.
-- =============================================================

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

-- reload PostgREST schema cache so /admin/setup checks see the changes immediately
NOTIFY pgrst, 'reload schema';

-- =============================================================
-- Database repair pack: quick replies, vendor change requests,
-- pricing completeness, settings columns, and public tracking.
-- Safe to re-run on partially imported databases.
-- =============================================================

CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  flat_fee numeric(10,2) NOT NULL DEFAULT 0,
  eta_minutes integer NOT NULL DEFAULT 30,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.zones TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.zones TO authenticated;
GRANT ALL ON public.zones TO service_role;
ALTER TABLE public.zones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anyone_read_zones ON public.zones;
CREATE POLICY anyone_read_zones ON public.zones FOR SELECT USING (true);
DROP POLICY IF EXISTS zones_admin_write ON public.zones;
CREATE POLICY zones_admin_write ON public.zones
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE TABLE IF NOT EXISTS public.vehicle_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.vehicle_types TO authenticated;
GRANT ALL ON public.vehicle_types TO service_role;
ALTER TABLE public.vehicle_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vehicle_types_read ON public.vehicle_types;
CREATE POLICY vehicle_types_read ON public.vehicle_types FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS vehicle_types_admin_write ON public.vehicle_types;
CREATE POLICY vehicle_types_admin_write ON public.vehicle_types
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));
INSERT INTO public.vehicle_types (name, code)
VALUES ('Motorbike', 'bike'), ('Car', 'car'), ('Van', 'van')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.delivery_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pickup_zone_id uuid REFERENCES public.zones(id) ON DELETE CASCADE,
  zone_id uuid NOT NULL REFERENCES public.zones(id) ON DELETE CASCADE,
  vehicle_type_id uuid NOT NULL REFERENCES public.vehicle_types(id) ON DELETE CASCADE,
  price_per_delivery numeric(10,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.delivery_prices TO authenticated;
GRANT ALL ON public.delivery_prices TO service_role;
ALTER TABLE public.delivery_prices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS delivery_prices_read ON public.delivery_prices;
CREATE POLICY delivery_prices_read ON public.delivery_prices FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS delivery_prices_admin_write ON public.delivery_prices;
CREATE POLICY delivery_prices_admin_write ON public.delivery_prices
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));
ALTER TABLE public.delivery_prices
  ADD COLUMN IF NOT EXISTS pickup_zone_id uuid REFERENCES public.zones(id) ON DELETE CASCADE;
UPDATE public.delivery_prices SET pickup_zone_id = zone_id WHERE pickup_zone_id IS NULL;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'delivery_prices_zone_id_vehicle_type_id_key'
      AND conrelid = 'public.delivery_prices'::regclass
  ) THEN
    ALTER TABLE public.delivery_prices DROP CONSTRAINT delivery_prices_zone_id_vehicle_type_id_key;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'delivery_prices_pickup_zone_id_zone_id_vehicle_type_id_key'
      AND conrelid = 'public.delivery_prices'::regclass
  ) THEN
    ALTER TABLE public.delivery_prices
      ADD CONSTRAINT delivery_prices_pickup_zone_id_zone_id_vehicle_type_id_key
      UNIQUE (pickup_zone_id, zone_id, vehicle_type_id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.quick_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  body text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quick_replies TO authenticated;
GRANT ALL ON public.quick_replies TO service_role;
ALTER TABLE public.quick_replies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS quick_replies_admin_read ON public.quick_replies;
CREATE POLICY quick_replies_admin_read ON public.quick_replies
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) AND is_active = true);
DROP POLICY IF EXISTS quick_replies_admin_write ON public.quick_replies;
CREATE POLICY quick_replies_admin_write ON public.quick_replies
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));
DROP TRIGGER IF EXISTS quick_replies_set_updated_at ON public.quick_replies;
CREATE TRIGGER quick_replies_set_updated_at BEFORE UPDATE ON public.quick_replies
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE IF NOT EXISTS public.vendor_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL,
  changes jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  admin_note text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendor_change_requests TO authenticated;
GRANT ALL ON public.vendor_change_requests TO service_role;
ALTER TABLE public.vendor_change_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vendor_change_requests_owner_read ON public.vendor_change_requests;
CREATE POLICY vendor_change_requests_owner_read ON public.vendor_change_requests
  FOR SELECT TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = vendor_id AND v.owner_id = auth.uid())
  );
DROP POLICY IF EXISTS vendor_change_requests_owner_insert ON public.vendor_change_requests;
CREATE POLICY vendor_change_requests_owner_insert ON public.vendor_change_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    requested_by = auth.uid()
    AND status = 'pending'
    AND EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = vendor_id AND v.owner_id = auth.uid())
  );
DROP POLICY IF EXISTS vendor_change_requests_admin_update ON public.vendor_change_requests;
CREATE POLICY vendor_change_requests_admin_update ON public.vendor_change_requests
  FOR UPDATE TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR (status = 'pending' AND EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = vendor_id AND v.owner_id = auth.uid()))
  )
  WITH CHECK (
    public.is_admin(auth.uid())
    OR (status = 'pending' AND requested_by = auth.uid() AND EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = vendor_id AND v.owner_id = auth.uid()))
  );
DROP POLICY IF EXISTS vendor_change_requests_admin_delete ON public.vendor_change_requests;
CREATE POLICY vendor_change_requests_admin_delete ON public.vendor_change_requests
  FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));
DROP TRIGGER IF EXISTS vendor_change_requests_set_updated_at ON public.vendor_change_requests;
CREATE TRIGGER vendor_change_requests_set_updated_at BEFORE UPDATE ON public.vendor_change_requests
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS seo_title text,
  ADD COLUMN IF NOT EXISTS seo_description text,
  ADD COLUMN IF NOT EXISTS seo_keywords text,
  ADD COLUMN IF NOT EXISTS contact_email text,
  ADD COLUMN IF NOT EXISTS contact_phone text,
  ADD COLUMN IF NOT EXISTS social_instagram text,
  ADD COLUMN IF NOT EXISTS social_facebook text,
  ADD COLUMN IF NOT EXISTS social_tiktok text,
  ADD COLUMN IF NOT EXISTS background_color text,
  ADD COLUMN IF NOT EXISTS foreground_color text,
  ADD COLUMN IF NOT EXISTS card_color text,
  ADD COLUMN IF NOT EXISTS muted_color text,
  ADD COLUMN IF NOT EXISTS border_color text,
  ADD COLUMN IF NOT EXISTS theme_mode text NOT NULL DEFAULT 'light',
  ADD COLUMN IF NOT EXISTS order_no_prefix text,
  ADD COLUMN IF NOT EXISTS public_url text,
  ADD COLUMN IF NOT EXISTS bank_name text,
  ADD COLUMN IF NOT EXISTS bank_account_name text,
  ADD COLUMN IF NOT EXISTS bank_account_number text,
  ADD COLUMN IF NOT EXISTS bank_branch text,
  ADD COLUMN IF NOT EXISTS bank_iban text,
  ADD COLUMN IF NOT EXISTS bank_swift text,
  ADD COLUMN IF NOT EXISTS bank_instructions text,
  ADD COLUMN IF NOT EXISTS sms_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sms_api_key text,
  ADD COLUMN IF NOT EXISTS sms_api_url text,
  ADD COLUMN IF NOT EXISTS sms_sender_id text,
  ADD COLUMN IF NOT EXISTS sms_enabled_picked boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sms_enabled_on_the_way boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sms_enabled_delivered boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sms_tpl_picked text,
  ADD COLUMN IF NOT EXISTS sms_tpl_on_the_way text,
  ADD COLUMN IF NOT EXISTS sms_tpl_delivered text;

UPDATE public.app_settings
   SET order_no_prefix = COALESCE(NULLIF(order_no_prefix, ''), 'BST')
 WHERE id = 1;

ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision,
  ADD COLUMN IF NOT EXISTS opening_hours jsonb;

CREATE TABLE IF NOT EXISTS public.order_number_counters (
  period_key text PRIMARY KEY,
  last_seq integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.order_number_counters TO authenticated;
GRANT ALL ON public.order_number_counters TO service_role;
ALTER TABLE public.order_number_counters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS counters_readable ON public.order_number_counters;
CREATE POLICY counters_readable ON public.order_number_counters
  FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.generate_order_tracking_no(_at timestamptz DEFAULT now())
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _prefix text;
  _mm text := to_char(_at, 'MM');
  _yy text := to_char(_at, 'YY');
  _period text := _mm || _yy;
  _seq integer;
BEGIN
  SELECT COALESCE(NULLIF(order_no_prefix, ''), 'BST') INTO _prefix FROM public.app_settings WHERE id = 1;
  IF _prefix IS NULL THEN _prefix := 'BST'; END IF;
  INSERT INTO public.order_number_counters(period_key, last_seq, updated_at)
  VALUES (_period, 1, now())
  ON CONFLICT (period_key) DO UPDATE
    SET last_seq = public.order_number_counters.last_seq + 1,
        updated_at = now()
  RETURNING last_seq INTO _seq;
  RETURN _prefix || '-' || _period || '-' || lpad(_seq::text, 4, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_set_order_tracking_no()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.tracking_no IS NULL OR NEW.tracking_no = '' THEN
    NEW.tracking_no := public.generate_order_tracking_no(COALESCE(NEW.created_at, now()));
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS orders_set_tracking_no ON public.orders;
CREATE TRIGGER orders_set_tracking_no
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_order_tracking_no();

GRANT SELECT ON public.orders TO anon;
GRANT SELECT ON public.order_status_events TO anon;
DROP POLICY IF EXISTS orders_public_tracking_read ON public.orders;
CREATE POLICY orders_public_tracking_read ON public.orders
  FOR SELECT TO anon
  USING (tracking_no IS NOT NULL AND tracking_no <> '');
DROP POLICY IF EXISTS order_events_public_tracking_read ON public.order_status_events;
CREATE POLICY order_events_public_tracking_read ON public.order_status_events
  FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_status_events.order_id
        AND o.tracking_no IS NOT NULL
        AND o.tracking_no <> ''
    )
  );

DO $$
DECLARE tbl record;
BEGIN
  FOR tbl IN
    SELECT c.relname AS table_name
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind='r' AND n.nspname='public'
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', tbl.table_name);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', tbl.table_name);
  END LOOP;
END $$;

GRANT SELECT ON public.app_settings TO anon;
GRANT SELECT ON public.zones TO anon;
GRANT SELECT ON public.vendors TO anon;
GRANT SELECT ON public.menu_items TO anon;
DO $$
BEGIN
  IF to_regclass('public.landing_content') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT ON public.landing_content TO anon';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
-- Run this in your Supabase SQL Editor (BYO project)
-- Allows signed-in users to upload/replace their own files; public buckets are world-readable.

drop policy if exists "authenticated upload avatars" on storage.objects;
drop policy if exists "authenticated update avatars" on storage.objects;
drop policy if exists "authenticated delete avatars" on storage.objects;
drop policy if exists "vendor upload assets" on storage.objects;
drop policy if exists "vendor update assets" on storage.objects;
drop policy if exists "vendor delete assets" on storage.objects;

create policy "authenticated upload avatars"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "authenticated update avatars"
  on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "authenticated delete avatars"
  on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- vendor-assets: only the owning vendor can write to their vendor-id folder
create policy "vendor upload assets"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'vendor-assets'
    and exists (
      select 1 from public.vendors v
      where v.id::text = (storage.foldername(name))[1]
        and v.owner_id = auth.uid()
    )
  );

create policy "vendor update assets"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'vendor-assets'
    and exists (
      select 1 from public.vendors v
      where v.id::text = (storage.foldername(name))[1]
        and v.owner_id = auth.uid()
    )
  );

create policy "vendor delete assets"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'vendor-assets'
    and exists (
      select 1 from public.vendors v
      where v.id::text = (storage.foldername(name))[1]
        and v.owner_id = auth.uid()
    )
  );

-- reload PostgREST schema cache so /admin/setup checks see the changes immediately
NOTIFY pgrst, 'reload schema';
-- Allow admins (and partners with manage_chat) to delete chat threads.
-- Messages cascade-delete via chat_messages.thread_id FK ON DELETE CASCADE.

DROP POLICY IF EXISTS thread_delete_admin ON public.chat_threads;
CREATE POLICY thread_delete_admin ON public.chat_threads
  FOR DELETE
  USING (
    public.is_admin(auth.uid())
    OR public.has_permission(auth.uid(), 'manage_chat'::public.app_permission)
  );

-- Optional: allow admins to delete individual messages too.
DROP POLICY IF EXISTS msg_delete_admin ON public.chat_messages;
CREATE POLICY msg_delete_admin ON public.chat_messages
  FOR DELETE
  USING (
    public.is_admin(auth.uid())
    OR public.has_permission(auth.uid(), 'manage_chat'::public.app_permission)
  );
-- reload PostgREST schema cache so /admin/setup checks see the changes immediately
NOTIFY pgrst, 'reload schema';
-- Run this in your Supabase SQL Editor.
-- 1) Add image attachment column to chat messages
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS image_url text;

-- 2) Re-apply chat delete policies (in case 0004 was not run)
DROP POLICY IF EXISTS thread_delete_admin ON public.chat_threads;
CREATE POLICY thread_delete_admin ON public.chat_threads
  FOR DELETE USING (
    public.is_admin(auth.uid())
    OR public.has_permission(auth.uid(), 'manage_chat'::public.app_permission)
  );

DROP POLICY IF EXISTS msg_delete_admin ON public.chat_messages;
CREATE POLICY msg_delete_admin ON public.chat_messages
  FOR DELETE USING (
    public.is_admin(auth.uid())
    OR public.has_permission(auth.uid(), 'manage_chat'::public.app_permission)
  );

-- 3) Storage policies for chat-images bucket (public read, authenticated write)
DROP POLICY IF EXISTS "chat_images_read" ON storage.objects;
CREATE POLICY "chat_images_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'chat-images');

DROP POLICY IF EXISTS "chat_images_insert" ON storage.objects;
CREATE POLICY "chat_images_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'chat-images');

DROP POLICY IF EXISTS "chat_images_delete" ON storage.objects;
CREATE POLICY "chat_images_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'chat-images' AND owner = auth.uid());
-- reload PostgREST schema cache so /admin/setup checks see the changes immediately
NOTIFY pgrst, 'reload schema';
CREATE TABLE IF NOT EXISTS public.password_reset_requests (
  email text PRIMARY KEY,
  last_sent_at timestamptz NOT NULL DEFAULT now(),
  request_count integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.password_reset_requests TO service_role;

ALTER TABLE public.password_reset_requests ENABLE ROW LEVEL SECURITY;
-- reload PostgREST schema cache so /admin/setup checks see the changes immediately
NOTIFY pgrst, 'reload schema';
-- 0007_orders_billing.sql
-- Pricing (vehicle types + zone×vehicle matrix), order extensions, partner billing.

-- Vehicle types -------------------------------------------------------------
create table if not exists public.vehicle_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.vehicle_types to authenticated;
grant all on public.vehicle_types to service_role;
alter table public.vehicle_types enable row level security;
drop policy if exists "vehicle_types read" on public.vehicle_types;
create policy "vehicle_types read" on public.vehicle_types for select to authenticated using (true);
drop policy if exists "vehicle_types admin write" on public.vehicle_types;
create policy "vehicle_types admin write" on public.vehicle_types for all to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
drop trigger if exists set_updated_at_vehicle_types on public.vehicle_types;
create trigger set_updated_at_vehicle_types before update on public.vehicle_types
  for each row execute function public.tg_set_updated_at();

-- Delivery prices (zone × vehicle) -----------------------------------------
create table if not exists public.delivery_prices (
  id uuid primary key default gen_random_uuid(),
  zone_id uuid not null references public.zones(id) on delete cascade,
  vehicle_type_id uuid not null references public.vehicle_types(id) on delete cascade,
  price_per_delivery numeric(10,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (zone_id, vehicle_type_id)
);
grant select on public.delivery_prices to authenticated;
grant all on public.delivery_prices to service_role;
alter table public.delivery_prices enable row level security;
drop policy if exists "delivery_prices read" on public.delivery_prices;
create policy "delivery_prices read" on public.delivery_prices for select to authenticated using (true);
drop policy if exists "delivery_prices admin write" on public.delivery_prices;
create policy "delivery_prices admin write" on public.delivery_prices for all to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
drop trigger if exists set_updated_at_delivery_prices on public.delivery_prices;
create trigger set_updated_at_delivery_prices before update on public.delivery_prices
  for each row execute function public.tg_set_updated_at();

-- Extend orders -------------------------------------------------------------
alter table public.orders
  add column if not exists pickup_zone_id uuid references public.zones(id),
  add column if not exists vehicle_type_id uuid references public.vehicle_types(id),
  add column if not exists customer_name text;

-- Partner billing entries ---------------------------------------------------
create table if not exists public.partner_billing_entries (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  partner_id uuid not null references public.vendors(id) on delete cascade,
  amount numeric(10,2) not null default 0,
  status text not null default 'unpaid' check (status in ('unpaid','paid','void')),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.partner_billing_entries to authenticated;
grant all on public.partner_billing_entries to service_role;
alter table public.partner_billing_entries enable row level security;
drop policy if exists "billing read own or admin" on public.partner_billing_entries;
create policy "billing read own or admin" on public.partner_billing_entries for select to authenticated
  using (public.is_admin(auth.uid()) or exists (
    select 1 from public.vendors v where v.id = partner_id and v.owner_id = auth.uid()
  ));
drop policy if exists "billing admin write" on public.partner_billing_entries;
create policy "billing admin write" on public.partner_billing_entries for all to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
drop trigger if exists set_updated_at_billing on public.partner_billing_entries;
create trigger set_updated_at_billing before update on public.partner_billing_entries
  for each row execute function public.tg_set_updated_at();

-- Partner payments (manual settlements) -------------------------------------
create table if not exists public.partner_payments (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.vendors(id) on delete cascade,
  amount numeric(10,2) not null,
  note text,
  recorded_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
grant select on public.partner_payments to authenticated;
grant all on public.partner_payments to service_role;
alter table public.partner_payments enable row level security;
drop policy if exists "payments read own or admin" on public.partner_payments;
create policy "payments read own or admin" on public.partner_payments for select to authenticated
  using (public.is_admin(auth.uid()) or exists (
    select 1 from public.vendors v where v.id = partner_id and v.owner_id = auth.uid()
  ));
drop policy if exists "payments admin write" on public.partner_payments;
create policy "payments admin write" on public.partner_payments for all to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- Auto-create billing entry on new order ------------------------------------
create or replace function public.tg_create_billing_entry() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.vendor_id is not null and coalesce(new.total, 0) > 0 then
    insert into public.partner_billing_entries (order_id, partner_id, amount, status)
    values (new.id, new.vendor_id, new.total, 'unpaid')
    on conflict (order_id) do nothing;
  end if;
  return new;
end; $$;

drop trigger if exists orders_billing_entry on public.orders;
create trigger orders_billing_entry after insert on public.orders
  for each row execute function public.tg_create_billing_entry();

-- Void billing entry when order cancelled -----------------------------------
create or replace function public.tg_void_billing_on_cancel() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'cancelled' and (old.status is distinct from new.status) then
    update public.partner_billing_entries
       set status = 'void'
     where order_id = new.id and status = 'unpaid';
  end if;
  return new;
end; $$;

drop trigger if exists orders_void_billing on public.orders;
create trigger orders_void_billing after update of status on public.orders
  for each row execute function public.tg_void_billing_on_cancel();

-- Allow vendors to insert their own orders + read; admins manage all.
drop policy if exists "orders insert own" on public.orders;
create policy "orders insert own" on public.orders for insert to authenticated
  with check (
    public.is_admin(auth.uid())
    or exists (select 1 from public.vendors v where v.id = vendor_id and v.owner_id = auth.uid())
  );
drop policy if exists "orders read own or admin" on public.orders;
create policy "orders read own or admin" on public.orders for select to authenticated
  using (
    public.is_admin(auth.uid())
    or exists (select 1 from public.vendors v where v.id = vendor_id and v.owner_id = auth.uid())
  );
drop policy if exists "orders admin update" on public.orders;
create policy "orders admin update" on public.orders for update to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
-- reload PostgREST schema cache so /admin/setup checks see the changes immediately
NOTIFY pgrst, 'reload schema';
-- Migration 0008 — landing content, telegram notifications, web push subscriptions

-- 1) Landing page content (single row id=1, edit from admin)
create table if not exists public.landing_content (
  id int primary key default 1,
  hero_title text,
  hero_subtitle text,
  hero_cta_label text,
  stats jsonb not null default '[]'::jsonb,    -- [{k,v}]
  features jsonb not null default '[]'::jsonb, -- [{t,d}]
  steps jsonb not null default '[]'::jsonb,    -- [{n,t,d}]
  cta_title text,
  cta_subtitle text,
  cta_label text,
  updated_at timestamptz not null default now(),
  constraint single_row check (id = 1)
);
insert into public.landing_content (id) values (1) on conflict (id) do nothing;

grant select on public.landing_content to anon, authenticated;
grant all on public.landing_content to service_role;
alter table public.landing_content enable row level security;

drop policy if exists "landing public read" on public.landing_content;
create policy "landing public read" on public.landing_content for select using (true);
drop policy if exists "landing admin write" on public.landing_content;
create policy "landing admin write" on public.landing_content
  for update to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- 2) Telegram notification settings
create table if not exists public.telegram_settings (
  id int primary key default 1,
  bot_token text,
  admin_chat_id text,        -- group/chat that receives admin alerts
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint single_row check (id = 1)
);
insert into public.telegram_settings (id) values (1) on conflict (id) do nothing;

grant select, insert, update on public.telegram_settings to authenticated;
grant all on public.telegram_settings to service_role;
alter table public.telegram_settings enable row level security;

drop policy if exists "telegram admin read" on public.telegram_settings;
create policy "telegram admin read" on public.telegram_settings
  for select to authenticated using (public.is_admin(auth.uid()));
drop policy if exists "telegram admin write" on public.telegram_settings;
create policy "telegram admin write" on public.telegram_settings
  for update to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- 3) Web push subscriptions (browser push)
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
grant select, insert, delete on public.push_subscriptions to authenticated;
grant all on public.push_subscriptions to service_role;
alter table public.push_subscriptions enable row level security;

drop policy if exists "push own" on public.push_subscriptions;
create policy "push own" on public.push_subscriptions
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 4) VAPID public/private keys (web push) — admin-only
create table if not exists public.push_vapid (
  id int primary key default 1,
  public_key text,
  private_key text,
  subject text default 'mailto:admin@example.com',
  updated_at timestamptz not null default now(),
  constraint single_row check (id = 1)
);
insert into public.push_vapid (id) values (1) on conflict (id) do nothing;
grant select on public.push_vapid to authenticated;  -- only public_key needed; private filtered in code
grant all on public.push_vapid to service_role;
alter table public.push_vapid enable row level security;
drop policy if exists "vapid admin all" on public.push_vapid;
create policy "vapid admin all" on public.push_vapid
  for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- reload PostgREST schema cache so /admin/setup checks see the changes immediately
NOTIFY pgrst, 'reload schema';
-- Partner billing cycle preference
ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS billing_cycle text NOT NULL DEFAULT 'weekly'
    CHECK (billing_cycle IN ('weekly','monthly'));

-- reload PostgREST schema cache so /admin/setup checks see the changes immediately
NOTIFY pgrst, 'reload schema';
-- Custom order form fields configured by admin, rendered in the partner order dialog.
CREATE TABLE IF NOT EXISTS public.order_form_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section text NOT NULL CHECK (section IN ('customer','delivery','other')),
  label text NOT NULL,
  field_key text NOT NULL,
  field_type text NOT NULL CHECK (field_type IN ('text','textarea','number','select')),
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  required boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (field_key)
);

GRANT SELECT ON public.order_form_fields TO authenticated;
GRANT ALL ON public.order_form_fields TO service_role;

ALTER TABLE public.order_form_fields ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "order_form_fields read auth" ON public.order_form_fields;
CREATE POLICY "order_form_fields read auth" ON public.order_form_fields
  FOR SELECT TO authenticated USING (true);

-- reload PostgREST schema cache so /admin/setup checks see the changes immediately
NOTIFY pgrst, 'reload schema';
-- 0011_staff_roles.sql
-- Staff roles (manager, supervisor, officer) with zone-scoped visibility.

create table if not exists public.staff_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  staff_role text not null check (staff_role in ('manager','supervisor','officer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.staff_members to authenticated;
grant all on public.staff_members to service_role;
alter table public.staff_members enable row level security;
drop policy if exists "staff_members self read" on public.staff_members;
create policy "staff_members self read" on public.staff_members for select to authenticated
  using (user_id = auth.uid() or public.is_admin(auth.uid()));
drop policy if exists "staff_members admin write" on public.staff_members;
create policy "staff_members admin write" on public.staff_members for all to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
drop trigger if exists set_updated_at_staff_members on public.staff_members;
create trigger set_updated_at_staff_members before update on public.staff_members
  for each row execute function public.tg_set_updated_at();

create table if not exists public.staff_zones (
  user_id uuid not null references auth.users(id) on delete cascade,
  zone_id uuid not null references public.zones(id) on delete cascade,
  primary key (user_id, zone_id),
  created_at timestamptz not null default now()
);
grant select on public.staff_zones to authenticated;
grant all on public.staff_zones to service_role;
alter table public.staff_zones enable row level security;
drop policy if exists "staff_zones self read" on public.staff_zones;
create policy "staff_zones self read" on public.staff_zones for select to authenticated
  using (user_id = auth.uid() or public.is_admin(auth.uid()));
drop policy if exists "staff_zones admin write" on public.staff_zones;
create policy "staff_zones admin write" on public.staff_zones for all to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- Helpers
create or replace function public.is_staff(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff_members where user_id = _user_id);
$$;

create or replace function public.staff_can_see_zone(_user_id uuid, _zone_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff_zones where user_id = _user_id and zone_id = _zone_id);
$$;

-- reload PostgREST schema cache so /admin/setup checks see the changes immediately
NOTIFY pgrst, 'reload schema';
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

NOTIFY pgrst, 'reload schema';-- Vendor geolocation (coarse; used for map links and future zone routing)
ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision;

NOTIFY pgrst, 'reload schema';-- Migration 0014 — extra editable landing sections (showcase / partners / footer tagline)

ALTER TABLE public.landing_content
  ADD COLUMN IF NOT EXISTS showcase_title text,
  ADD COLUMN IF NOT EXISTS showcase_subtitle text,
  ADD COLUMN IF NOT EXISTS partners_title text,
  ADD COLUMN IF NOT EXISTS partners_subtitle text,
  ADD COLUMN IF NOT EXISTS show_partners boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS footer_tagline text;

NOTIFY pgrst, 'reload schema';-- Migration 0015 — extended color scheme controls for the whole system.

ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS background_color text,
  ADD COLUMN IF NOT EXISTS foreground_color text,
  ADD COLUMN IF NOT EXISTS card_color text,
  ADD COLUMN IF NOT EXISTS muted_color text,
  ADD COLUMN IF NOT EXISTS border_color text,
  ADD COLUMN IF NOT EXISTS theme_mode text NOT NULL DEFAULT 'light';

NOTIFY pgrst, 'reload schema';-- Admin bank details on app_settings + partner-submitted payment receipts

ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS bank_name text,
  ADD COLUMN IF NOT EXISTS bank_account_name text,
  ADD COLUMN IF NOT EXISTS bank_account_number text,
  ADD COLUMN IF NOT EXISTS bank_branch text,
  ADD COLUMN IF NOT EXISTS bank_iban text,
  ADD COLUMN IF NOT EXISTS bank_swift text,
  ADD COLUMN IF NOT EXISTS bank_instructions text;

-- Extend partner_payments so partners can submit receipts for admin verification
ALTER TABLE public.partner_payments
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'verified'
    CHECK (status IN ('pending','verified','rejected')),
  ADD COLUMN IF NOT EXISTS receipt_url text,
  ADD COLUMN IF NOT EXISTS reference text,
  ADD COLUMN IF NOT EXISTS period_key text,
  ADD COLUMN IF NOT EXISTS cycle text CHECK (cycle IN ('weekly','monthly')),
  ADD COLUMN IF NOT EXISTS submitted_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS verified_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_reason text;

-- Allow partners to submit their own payment records (pending state)
DROP POLICY IF EXISTS "payments partner insert own" ON public.partner_payments;
CREATE POLICY "payments partner insert own" ON public.partner_payments
  FOR INSERT TO authenticated
  WITH CHECK (
    status = 'pending'
    AND submitted_by = auth.uid()
    AND EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = partner_id AND v.owner_id = auth.uid())
  );

-- Partners can update their own still-pending submissions (e.g. re-upload receipt)
DROP POLICY IF EXISTS "payments partner update pending" ON public.partner_payments;
CREATE POLICY "payments partner update pending" ON public.partner_payments
  FOR UPDATE TO authenticated
  USING (
    status = 'pending'
    AND EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = partner_id AND v.owner_id = auth.uid())
  )
  WITH CHECK (
    status = 'pending'
    AND EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = partner_id AND v.owner_id = auth.uid())
  );

NOTIFY pgrst, 'reload schema';-- Adds public site URL + SMS (Owl-compatible) settings to app_settings.
-- Safe to re-run.

ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS public_url text;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS sms_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS sms_api_key text;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS sms_api_url text;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS sms_sender_id text;

NOTIFY pgrst, 'reload schema';-- Adds a JSONB opening_hours schedule to vendors so partners can advertise operating hours.
-- Shape: { tz?: string, days: [{ closed: bool, open: "HH:MM", close: "HH:MM" }] } — 7 entries, Sunday..Saturday.
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS opening_hours JSONB;
NOTIFY pgrst, 'reload schema';
-- =============================================================
-- Pricing schema fix: add pickup_zone_id to delivery_prices
-- (the app UI treats prices as pickup_zone x dropoff_zone x vehicle)
-- =============================================================
DO $$
BEGIN
  IF to_regclass('public.delivery_prices') IS NOT NULL THEN
    ALTER TABLE public.delivery_prices
      ADD COLUMN IF NOT EXISTS pickup_zone_id uuid REFERENCES public.zones(id) ON DELETE CASCADE;

    -- Backfill any existing rows so pickup = dropoff by default
    UPDATE public.delivery_prices
       SET pickup_zone_id = zone_id
     WHERE pickup_zone_id IS NULL;

    -- Replace old unique constraint (zone_id, vehicle_type_id) with the 3-column one
    IF EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conname = 'delivery_prices_zone_id_vehicle_type_id_key'
    ) THEN
      ALTER TABLE public.delivery_prices
        DROP CONSTRAINT delivery_prices_zone_id_vehicle_type_id_key;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conname = 'delivery_prices_pickup_zone_id_zone_id_vehicle_type_id_key'
    ) THEN
      ALTER TABLE public.delivery_prices
        ADD CONSTRAINT delivery_prices_pickup_zone_id_zone_id_vehicle_type_id_key
        UNIQUE (pickup_zone_id, zone_id, vehicle_type_id);
    END IF;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- =============================================================
-- Restore Data-API grants for every public table
-- (setup.sql created tables without granting to anon/authenticated,
--  which makes admin/settings and other pages hang on "Loading…")
-- =============================================================
DO $$
DECLARE tbl record;
BEGIN
  FOR tbl IN
    SELECT c.relname AS table_name
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind='r' AND n.nspname='public'
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', tbl.table_name);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', tbl.table_name);
  END LOOP;
END $$;

-- Public-facing tables that legitimately allow anonymous read
DO $$
BEGIN
  IF to_regclass('public.app_settings')    IS NOT NULL THEN EXECUTE 'GRANT SELECT ON public.app_settings    TO anon'; END IF;
  IF to_regclass('public.zones')           IS NOT NULL THEN EXECUTE 'GRANT SELECT ON public.zones           TO anon'; END IF;
  IF to_regclass('public.vendors')         IS NOT NULL THEN EXECUTE 'GRANT SELECT ON public.vendors         TO anon'; END IF;
  IF to_regclass('public.menu_items')      IS NOT NULL THEN EXECUTE 'GRANT SELECT ON public.menu_items      TO anon'; END IF;
  IF to_regclass('public.landing_content') IS NOT NULL THEN EXECUTE 'GRANT SELECT ON public.landing_content TO anon'; END IF;
END $$;

NOTIFY pgrst, 'reload schema';
