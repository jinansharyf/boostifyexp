
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
