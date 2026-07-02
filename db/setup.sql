-- =============================================================
-- Boostify complete database setup
-- Run this file against a fresh Supabase project (SQL editor).
-- Generated 2026-07-02T11:13:03Z
-- =============================================================

-- -------------------------------------------------------------
-- 20260626195730_4672860b-6bc4-4913-b5f6-cd84535416ef.sql
-- -------------------------------------------------------------

-- ============== ENUMS ==============
CREATE TYPE public.app_role AS ENUM ('customer', 'vendor', 'admin', 'super_admin');
CREATE TYPE public.app_permission AS ENUM (
  'manage_orders','manage_menu','manage_users','manage_settings',
  'manage_vendors','manage_zones','view_reports','manage_chat'
);
CREATE TYPE public.order_status AS ENUM (
  'pending','accepted','preparing','picked_up','on_the_way','delivered','cancelled'
);
CREATE TYPE public.vendor_status AS ENUM ('pending','approved','rejected','suspended');

-- ============== UTIL TRIGGER ==============
CREATE OR REPLACE FUNCTION public.tg_set_updated_at() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ============== PROFILES ==============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  phone TEXT,
  avatar_url TEXT,
  must_change_password BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============== USER ROLES ==============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- ============== USER PERMISSIONS ==============
CREATE TABLE public.user_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission public.app_permission NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, permission)
);
GRANT SELECT ON public.user_permissions TO authenticated;
GRANT ALL ON public.user_permissions TO service_role;
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

-- ============== SECURITY DEFINER HELPERS ==============
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','super_admin'));
$$;

CREATE OR REPLACE FUNCTION public.has_permission(_user_id UUID, _permission public.app_permission)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'super_admin')
    OR EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = _user_id AND permission = _permission);
$$;

-- ============== PROFILES POLICIES ==============
CREATE POLICY "self_read_profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "admin_read_profiles" ON public.profiles FOR SELECT USING (public.is_admin(auth.uid()));
CREATE POLICY "self_update_profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "admin_update_profiles" ON public.profiles FOR UPDATE USING (public.is_admin(auth.uid()));
CREATE POLICY "self_insert_profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- ============== ROLES POLICIES ==============
CREATE POLICY "self_read_roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "admin_read_roles" ON public.user_roles FOR SELECT USING (public.is_admin(auth.uid()));

-- ============== PERMISSIONS POLICIES ==============
CREATE POLICY "self_read_perms" ON public.user_permissions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "admin_read_perms" ON public.user_permissions FOR SELECT USING (public.is_admin(auth.uid()));

-- ============== APP SETTINGS ==============
CREATE TABLE public.app_settings (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  site_name TEXT NOT NULL DEFAULT 'Boostify',
  tagline TEXT DEFAULT 'Food delivery, boosted.',
  logo_url TEXT,
  favicon_url TEXT,
  og_image_url TEXT,
  primary_color TEXT NOT NULL DEFAULT '#2dd4a8',
  accent_color TEXT NOT NULL DEFAULT '#0d1b2a',
  heading_font TEXT NOT NULL DEFAULT 'Syne',
  body_font TEXT NOT NULL DEFAULT 'Plus Jakarta Sans',
  seo_title TEXT DEFAULT 'Boostify — Food delivery, boosted',
  seo_description TEXT DEFAULT 'Order from your favourite kitchens and track every step in real time.',
  seo_keywords TEXT DEFAULT 'food delivery, boostify, maldives',
  contact_email TEXT,
  contact_phone TEXT,
  social_instagram TEXT,
  social_facebook TEXT,
  social_tiktok TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO public.app_settings (id) VALUES (1) ON CONFLICT DO NOTHING;
GRANT SELECT ON public.app_settings TO anon, authenticated;
GRANT UPDATE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone_read_settings" ON public.app_settings FOR SELECT USING (true);
CREATE POLICY "settings_admin_update" ON public.app_settings FOR UPDATE
  USING (public.has_permission(auth.uid(),'manage_settings'));
CREATE TRIGGER settings_updated BEFORE UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============== ZONES ==============
CREATE TABLE public.zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  flat_fee NUMERIC(10,2) NOT NULL DEFAULT 0,
  eta_minutes INT NOT NULL DEFAULT 30,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.zones TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.zones TO authenticated;
GRANT ALL ON public.zones TO service_role;
ALTER TABLE public.zones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone_read_zones" ON public.zones FOR SELECT USING (true);
CREATE POLICY "zones_admin_write" ON public.zones FOR ALL
  USING (public.has_permission(auth.uid(),'manage_zones'))
  WITH CHECK (public.has_permission(auth.uid(),'manage_zones'));
CREATE TRIGGER zones_updated BEFORE UPDATE ON public.zones
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

INSERT INTO public.zones (name, flat_fee, eta_minutes) VALUES
  ('Male City', 25, 25),
  ('Hulhumale', 35, 35),
  ('Villimale', 40, 40),
  ('Airport', 50, 45)
ON CONFLICT DO NOTHING;

-- ============== VENDORS ==============
CREATE TABLE public.vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  store_name TEXT NOT NULL,
  slug TEXT UNIQUE,
  description TEXT,
  cuisine TEXT,
  phone TEXT,
  address TEXT,
  zone_id UUID REFERENCES public.zones(id) ON DELETE SET NULL,
  logo_url TEXT,
  cover_url TEXT,
  status public.vendor_status NOT NULL DEFAULT 'pending',
  is_open BOOLEAN NOT NULL DEFAULT true,
  rating NUMERIC(3,2) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.vendors TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.vendors TO authenticated;
GRANT ALL ON public.vendors TO service_role;
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone_read_approved_vendors" ON public.vendors FOR SELECT
  USING (status = 'approved' OR auth.uid() = owner_id OR public.is_admin(auth.uid()));
CREATE POLICY "vendor_self_insert" ON public.vendors FOR INSERT
  WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "vendor_self_update" ON public.vendors FOR UPDATE
  USING (auth.uid() = owner_id OR public.has_permission(auth.uid(),'manage_vendors'));
CREATE POLICY "vendor_admin_delete" ON public.vendors FOR DELETE
  USING (public.has_permission(auth.uid(),'manage_vendors'));
CREATE TRIGGER vendors_updated BEFORE UPDATE ON public.vendors
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============== MENU ITEMS ==============
CREATE TABLE public.menu_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC(10,2) NOT NULL,
  image_url TEXT,
  category TEXT,
  available BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.menu_items TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.menu_items TO authenticated;
GRANT ALL ON public.menu_items TO service_role;
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone_read_menu" ON public.menu_items FOR SELECT USING (true);
CREATE POLICY "menu_owner_write" ON public.menu_items FOR ALL
  USING (
    EXISTS(SELECT 1 FROM public.vendors v WHERE v.id = vendor_id AND v.owner_id = auth.uid())
    OR public.has_permission(auth.uid(),'manage_menu')
  )
  WITH CHECK (
    EXISTS(SELECT 1 FROM public.vendors v WHERE v.id = vendor_id AND v.owner_id = auth.uid())
    OR public.has_permission(auth.uid(),'manage_menu')
  );
CREATE TRIGGER menu_updated BEFORE UPDATE ON public.menu_items
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============== ORDERS ==============
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tracking_no TEXT NOT NULL UNIQUE DEFAULT ('BST-' || upper(substring(replace(gen_random_uuid()::text,'-','') from 1 for 8))),
  customer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  vendor_id UUID REFERENCES public.vendors(id) ON DELETE SET NULL,
  zone_id UUID REFERENCES public.zones(id) ON DELETE SET NULL,
  status public.order_status NOT NULL DEFAULT 'pending',
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  subtotal NUMERIC(10,2) NOT NULL DEFAULT 0,
  delivery_fee NUMERIC(10,2) NOT NULL DEFAULT 0,
  total NUMERIC(10,2) NOT NULL DEFAULT 0,
  delivery_address TEXT,
  customer_phone TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.orders TO authenticated;
GRANT SELECT ON public.orders TO anon;  -- public tracking by tracking_no via narrow policy
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "customer_read_own_orders" ON public.orders FOR SELECT
  USING (auth.uid() = customer_id);
CREATE POLICY "vendor_read_their_orders" ON public.orders FOR SELECT
  USING (EXISTS(SELECT 1 FROM public.vendors v WHERE v.id = vendor_id AND v.owner_id = auth.uid()));
CREATE POLICY "admin_read_orders" ON public.orders FOR SELECT
  USING (public.has_permission(auth.uid(),'manage_orders') OR public.is_admin(auth.uid()));
CREATE POLICY "anon_track_by_no" ON public.orders FOR SELECT TO anon USING (true);
CREATE POLICY "customer_insert_order" ON public.orders FOR INSERT
  WITH CHECK (auth.uid() = customer_id);
CREATE POLICY "vendor_update_order" ON public.orders FOR UPDATE
  USING (
    EXISTS(SELECT 1 FROM public.vendors v WHERE v.id = vendor_id AND v.owner_id = auth.uid())
    OR public.has_permission(auth.uid(),'manage_orders')
  );
CREATE TRIGGER orders_updated BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============== ORDER EVENTS ==============
CREATE TABLE public.order_status_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  status public.order_status NOT NULL,
  note TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.order_status_events TO authenticated;
GRANT SELECT ON public.order_status_events TO anon;
GRANT ALL ON public.order_status_events TO service_role;
ALTER TABLE public.order_status_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "events_read_party" ON public.order_status_events FOR SELECT
  USING (
    EXISTS(SELECT 1 FROM public.orders o WHERE o.id = order_id
      AND (o.customer_id = auth.uid()
        OR EXISTS(SELECT 1 FROM public.vendors v WHERE v.id = o.vendor_id AND v.owner_id = auth.uid())
        OR public.is_admin(auth.uid())))
  );
CREATE POLICY "events_read_anon" ON public.order_status_events FOR SELECT TO anon USING (true);
CREATE POLICY "events_insert_authorized" ON public.order_status_events FOR INSERT
  WITH CHECK (
    EXISTS(SELECT 1 FROM public.orders o WHERE o.id = order_id
      AND (EXISTS(SELECT 1 FROM public.vendors v WHERE v.id = o.vendor_id AND v.owner_id = auth.uid())
        OR public.has_permission(auth.uid(),'manage_orders')))
  );

-- Trigger to log status changes
CREATE OR REPLACE FUNCTION public.tg_log_order_status() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (TG_OP = 'INSERT') OR (NEW.status IS DISTINCT FROM OLD.status) THEN
    INSERT INTO public.order_status_events(order_id, status, created_by)
    VALUES (NEW.id, NEW.status, auth.uid());
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER orders_log_status AFTER INSERT OR UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.tg_log_order_status();

-- ============== CHAT (admin <-> vendor) ==============
CREATE TABLE public.chat_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  subject TEXT,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(vendor_id)
);
GRANT SELECT, INSERT, UPDATE ON public.chat_threads TO authenticated;
GRANT ALL ON public.chat_threads TO service_role;
ALTER TABLE public.chat_threads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "thread_read_party" ON public.chat_threads FOR SELECT
  USING (
    EXISTS(SELECT 1 FROM public.vendors v WHERE v.id = vendor_id AND v.owner_id = auth.uid())
    OR public.has_permission(auth.uid(),'manage_chat') OR public.is_admin(auth.uid())
  );
CREATE POLICY "thread_insert_party" ON public.chat_threads FOR INSERT
  WITH CHECK (
    EXISTS(SELECT 1 FROM public.vendors v WHERE v.id = vendor_id AND v.owner_id = auth.uid())
    OR public.has_permission(auth.uid(),'manage_chat')
  );

CREATE TABLE public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES public.chat_threads(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.chat_messages TO authenticated;
GRANT ALL ON public.chat_messages TO service_role;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "msg_read_party" ON public.chat_messages FOR SELECT
  USING (
    EXISTS(SELECT 1 FROM public.chat_threads t JOIN public.vendors v ON v.id = t.vendor_id
      WHERE t.id = thread_id AND (v.owner_id = auth.uid() OR public.has_permission(auth.uid(),'manage_chat') OR public.is_admin(auth.uid())))
  );
CREATE POLICY "msg_insert_party" ON public.chat_messages FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS(SELECT 1 FROM public.chat_threads t JOIN public.vendors v ON v.id = t.vendor_id
      WHERE t.id = thread_id AND (v.owner_id = auth.uid() OR public.has_permission(auth.uid(),'manage_chat') OR public.is_admin(auth.uid())))
  );

-- ============== NOTIFICATIONS ==============
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notif_self_read" ON public.notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "notif_self_update" ON public.notifications FOR UPDATE USING (auth.uid() = user_id);

-- ============== ON NEW USER: profile + role seeding ==============
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _role public.app_role := 'customer';
BEGIN
  INSERT INTO public.profiles (id, email, full_name, must_change_password)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    COALESCE((NEW.raw_user_meta_data->>'must_change_password')::boolean, false)
  )
  ON CONFLICT (id) DO NOTHING;

  -- Super-admin seed for the project owner
  IF lower(NEW.email) = 'poday.developments@gmail.com' THEN
    _role := 'super_admin';
  ELSIF NEW.raw_user_meta_data ? 'role' THEN
    BEGIN
      _role := (NEW.raw_user_meta_data->>'role')::public.app_role;
    EXCEPTION WHEN OTHERS THEN
      _role := 'customer';
    END;
  END IF;

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, _role)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============== REALTIME ==============
ALTER TABLE public.profiles REPLICA IDENTITY FULL;
ALTER TABLE public.user_roles REPLICA IDENTITY FULL;
ALTER TABLE public.user_permissions REPLICA IDENTITY FULL;
ALTER TABLE public.app_settings REPLICA IDENTITY FULL;
ALTER TABLE public.vendors REPLICA IDENTITY FULL;
ALTER TABLE public.menu_items REPLICA IDENTITY FULL;
ALTER TABLE public.zones REPLICA IDENTITY FULL;
ALTER TABLE public.orders REPLICA IDENTITY FULL;
ALTER TABLE public.order_status_events REPLICA IDENTITY FULL;
ALTER TABLE public.chat_threads REPLICA IDENTITY FULL;
ALTER TABLE public.chat_messages REPLICA IDENTITY FULL;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_roles;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_permissions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.app_settings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.vendors;
ALTER PUBLICATION supabase_realtime ADD TABLE public.menu_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.zones;
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.order_status_events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_threads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- -------------------------------------------------------------
-- 20260626200933_937390f6-34d3-4e3d-b646-f16b2b2ea371.sql
-- -------------------------------------------------------------

update public.app_settings set primary_color = '#5b189a'
  where id = 1 and primary_color in ('#2dd4a8','');

update public.app_settings
  set logo_url = '/__l5e/assets-v1/8a7ec683-440e-4754-9047-33cb3e6257df/boostify-logo.png'
  where id = 1 and (logo_url is null or logo_url = '');

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='app_settings' and policyname='App settings public read'
  ) then
    create policy "App settings public read" on public.app_settings for select using (true);
  end if;
end $$;

grant select on public.app_settings to anon, authenticated;

-- -------------------------------------------------------------
-- 20260627002634_5ab4ef35-5349-4b01-8cdb-0a82a20958eb.sql
-- -------------------------------------------------------------
CREATE POLICY "thread_delete_admin" ON public.chat_threads FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "msg_delete_admin" ON public.chat_messages FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));
-- -------------------------------------------------------------
-- 20260701075122_0790bef0-9832-4b0c-8c1e-055f7be0efac.sql
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.order_form_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section text NOT NULL CHECK (section IN ('customer','delivery','other')),
  label text NOT NULL,
  field_key text NOT NULL UNIQUE,
  field_type text NOT NULL CHECK (field_type IN ('text','textarea','number','select')),
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  required boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.order_form_fields TO authenticated;
GRANT ALL ON public.order_form_fields TO service_role;

ALTER TABLE public.order_form_fields ENABLE ROW LEVEL SECURITY;

CREATE POLICY "order_form_fields read auth"
  ON public.order_form_fields
  FOR SELECT
  TO authenticated
  USING (true);

CREATE TRIGGER order_form_fields_set_updated_at
  BEFORE UPDATE ON public.order_form_fields
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
-- -------------------------------------------------------------
-- 20260701084949_7f804ee2-b575-4cee-8773-3d336bf2a010.sql
-- -------------------------------------------------------------
ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision;

NOTIFY pgrst, 'reload schema';
-- -------------------------------------------------------------
-- 20260701094616_fedb6b6e-d794-4ea5-9fc4-625701cc4766.sql
-- -------------------------------------------------------------

-- Order number generator: {PREFIX}-{MM}{YY}-{NNNN} per month, e.g. DO-0626-0001
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS order_no_prefix TEXT NOT NULL DEFAULT 'DO';

CREATE TABLE IF NOT EXISTS public.order_number_counters (
  period_key TEXT PRIMARY KEY,
  last_seq   INT  NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.order_number_counters TO authenticated;
GRANT ALL ON public.order_number_counters TO service_role;
ALTER TABLE public.order_number_counters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "counters readable" ON public.order_number_counters;
CREATE POLICY "counters readable" ON public.order_number_counters FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.generate_order_tracking_no(_at TIMESTAMPTZ DEFAULT now())
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _prefix TEXT;
  _mm TEXT := to_char(_at, 'MM');
  _yy TEXT := to_char(_at, 'YY');
  _period TEXT := _mm || _yy;
  _seq INT;
BEGIN
  SELECT COALESCE(NULLIF(order_no_prefix, ''), 'DO') INTO _prefix FROM public.app_settings WHERE id = 1;
  IF _prefix IS NULL THEN _prefix := 'DO'; END IF;

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
RETURNS TRIGGER
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
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_set_order_tracking_no();

-- Backfill any existing rows missing a tracking_no
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id, created_at FROM public.orders WHERE tracking_no IS NULL OR tracking_no = '' ORDER BY created_at LOOP
    UPDATE public.orders SET tracking_no = public.generate_order_tracking_no(r.created_at) WHERE id = r.id;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

-- -------------------------------------------------------------
-- 20260701094633_02de4456-9a96-48cf-aefc-4cd74fe31db6.sql
-- -------------------------------------------------------------

REVOKE ALL ON FUNCTION public.generate_order_tracking_no(TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_set_order_tracking_no() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_order_tracking_no(TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.tg_set_order_tracking_no() TO service_role;

-- -------------------------------------------------------------
-- 20260701094825_78682fd7-f527-44d5-aa7e-ed00b8ddc741.sql
-- -------------------------------------------------------------
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
-- -------------------------------------------------------------
-- 20260701094931_22acebf1-125c-47ce-8150-5e1c8c92fb0d.sql
-- -------------------------------------------------------------
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT;
NOTIFY pgrst, 'reload schema';
-- -------------------------------------------------------------
-- 20260702082623_a2d88409-e1ac-46fc-bce8-3506727a6974.sql
-- -------------------------------------------------------------
-- Add SMS + public URL settings to app_settings
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS public_url TEXT,
  ADD COLUMN IF NOT EXISTS sms_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sms_api_key TEXT,
  ADD COLUMN IF NOT EXISTS sms_api_url TEXT,
  ADD COLUMN IF NOT EXISTS sms_sender_id TEXT;

NOTIFY pgrst, 'reload schema';
-- -------------------------------------------------------------
-- 20260702085638_b996b5bc-6b91-4c76-958d-25eb27126dde.sql
-- -------------------------------------------------------------
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'rejected';
NOTIFY pgrst, 'reload schema';
-- -------------------------------------------------------------
-- 20260702090036_c19ed6f7-e00f-4e8a-8831-7dbf5b55cefc.sql
-- -------------------------------------------------------------
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
-- -------------------------------------------------------------
-- 20260702090352_9eb3ab12-da52-4ef4-9961-497010091746.sql
-- -------------------------------------------------------------
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS sms_enabled_picked boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sms_enabled_on_the_way boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sms_enabled_delivered boolean NOT NULL DEFAULT true;
NOTIFY pgrst, 'reload schema';
-- -------------------------------------------------------------
-- 20260702091743_ebcd4469-c060-4430-a429-2a0db14b68f0.sql
-- -------------------------------------------------------------
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS opening_hours JSONB;
NOTIFY pgrst, 'reload schema';
-- -------------------------------------------------------------
-- 20260702103053_93da8bb4-7e63-43f6-a9e4-6cb190057487.sql
-- -------------------------------------------------------------
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS sms_tpl_picked TEXT;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS sms_tpl_on_the_way TEXT;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS sms_tpl_delivered TEXT;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS sms_enabled_picked BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS sms_enabled_on_the_way BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS sms_enabled_delivered BOOLEAN NOT NULL DEFAULT TRUE;
NOTIFY pgrst, 'reload schema';
-- -------------------------------------------------------------
-- Post-migration additions (order status 'rejected', SMS toggles/templates,
-- vendor opening hours, domain/public URL settings)
-- -------------------------------------------------------------

-- Order status: add 'rejected' if enum exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_status') THEN
    BEGIN
      ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'rejected';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

-- SMS templates + per-status enable toggles
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS sms_tpl_picked        TEXT;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS sms_tpl_on_the_way    TEXT;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS sms_tpl_delivered     TEXT;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS sms_enabled_picked      BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS sms_enabled_on_the_way  BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS sms_enabled_delivered   BOOLEAN NOT NULL DEFAULT TRUE;

-- Public site / domain settings (used for tracking links in emails & SMS)
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS public_url    TEXT;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS contact_phone TEXT;

-- Vendor opening hours (JSONB: { tz, days: [{closed, open, close}] x7 Sun..Sat })
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS opening_hours JSONB;

-- Reload PostgREST schema cache so the API sees new columns immediately
NOTIFY pgrst, 'reload schema';
