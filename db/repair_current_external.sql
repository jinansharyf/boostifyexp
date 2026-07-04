-- Boostify external database repair
-- Run this in your external database SQL editor. Safe to re-run.
-- Fixes: missing quick_replies, vendor/settings loading, Admin Settings email table,
-- zone price saving, and public tracking support.

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

CREATE TABLE IF NOT EXISTS public.email_settings (
  id int PRIMARY KEY DEFAULT 1,
  resend_api_key text,
  email_from text,
  email_from_name text,
  admin_notification_email text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT email_settings_single_row CHECK (id = 1)
);
INSERT INTO public.email_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
GRANT SELECT, INSERT, UPDATE ON public.email_settings TO authenticated;
GRANT ALL ON public.email_settings TO service_role;
ALTER TABLE public.email_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS email_settings_admin_read ON public.email_settings;
CREATE POLICY email_settings_admin_read ON public.email_settings
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));
DROP POLICY IF EXISTS email_settings_admin_write ON public.email_settings;
CREATE POLICY email_settings_admin_write ON public.email_settings
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));
DROP TRIGGER IF EXISTS email_settings_set_updated_at ON public.email_settings;
CREATE TRIGGER email_settings_set_updated_at BEFORE UPDATE ON public.email_settings
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

INSERT INTO public.app_settings (id, site_name)
VALUES (1, 'Boostify Express')
ON CONFLICT (id) DO NOTHING;
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

REVOKE ALL ON FUNCTION public.generate_order_tracking_no(timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_set_order_tracking_no() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_order_tracking_no(timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.tg_set_order_tracking_no() TO service_role;

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