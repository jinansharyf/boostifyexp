--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.9

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

-- CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

-- COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: app_permission; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.app_permission AS ENUM (
    'manage_orders',
    'manage_menu',
    'manage_users',
    'manage_settings',
    'manage_vendors',
    'manage_zones',
    'view_reports',
    'manage_chat'
);


--
-- Name: app_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.app_role AS ENUM (
    'customer',
    'vendor',
    'admin',
    'super_admin'
);


--
-- Name: order_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.order_status AS ENUM (
    'pending',
    'accepted',
    'preparing',
    'picked_up',
    'on_the_way',
    'delivered',
    'cancelled'
);


--
-- Name: vendor_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.vendor_status AS ENUM (
    'pending',
    'approved',
    'rejected',
    'suspended'
);


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: has_permission(uuid, public.app_permission); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_permission(_user_id uuid, _permission public.app_permission) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'super_admin')
    OR EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = _user_id AND permission = _permission);
$$;


--
-- Name: has_role(uuid, public.app_role); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;


--
-- Name: is_admin(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_admin(_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','super_admin'));
$$;


--
-- Name: tg_log_order_status(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tg_log_order_status() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF (TG_OP = 'INSERT') OR (NEW.status IS DISTINCT FROM OLD.status) THEN
    INSERT INTO public.order_status_events(order_id, status, created_by)
    VALUES (NEW.id, NEW.status, auth.uid());
  END IF;
  RETURN NEW;
END; $$;


--
-- Name: tg_set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tg_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: app_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_settings (
    id integer DEFAULT 1 NOT NULL,
    site_name text DEFAULT 'Boostify'::text NOT NULL,
    tagline text DEFAULT 'Food delivery, boosted.'::text,
    logo_url text,
    favicon_url text,
    og_image_url text,
    primary_color text DEFAULT '#2dd4a8'::text NOT NULL,
    accent_color text DEFAULT '#0d1b2a'::text NOT NULL,
    heading_font text DEFAULT 'Syne'::text NOT NULL,
    body_font text DEFAULT 'Plus Jakarta Sans'::text NOT NULL,
    seo_title text DEFAULT 'Boostify — Food delivery, boosted'::text,
    seo_description text DEFAULT 'Order from your favourite kitchens and track every step in real time.'::text,
    seo_keywords text DEFAULT 'food delivery, boostify, maldives'::text,
    contact_email text,
    contact_phone text,
    social_instagram text,
    social_facebook text,
    social_tiktok text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT app_settings_id_check CHECK ((id = 1))
);

ALTER TABLE ONLY public.app_settings REPLICA IDENTITY FULL;


--
-- Name: chat_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    thread_id uuid NOT NULL,
    sender_id uuid NOT NULL,
    body text NOT NULL,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.chat_messages REPLICA IDENTITY FULL;


--
-- Name: chat_threads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_threads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    vendor_id uuid NOT NULL,
    subject text,
    last_message_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.chat_threads REPLICA IDENTITY FULL;


--
-- Name: menu_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.menu_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    vendor_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    price numeric(10,2) NOT NULL,
    image_url text,
    category text,
    available boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.menu_items REPLICA IDENTITY FULL;


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title text NOT NULL,
    body text,
    link text,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.notifications REPLICA IDENTITY FULL;


--
-- Name: order_status_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_status_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    status public.order_status NOT NULL,
    note text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.order_status_events REPLICA IDENTITY FULL;


--
-- Name: orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tracking_no text DEFAULT ('BST-'::text || upper(SUBSTRING(replace((gen_random_uuid())::text, '-'::text, ''::text) FROM 1 FOR 8))) NOT NULL,
    customer_id uuid,
    vendor_id uuid,
    zone_id uuid,
    status public.order_status DEFAULT 'pending'::public.order_status NOT NULL,
    items jsonb DEFAULT '[]'::jsonb NOT NULL,
    subtotal numeric(10,2) DEFAULT 0 NOT NULL,
    delivery_fee numeric(10,2) DEFAULT 0 NOT NULL,
    total numeric(10,2) DEFAULT 0 NOT NULL,
    delivery_address text,
    customer_phone text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.orders REPLICA IDENTITY FULL;


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    email text NOT NULL,
    full_name text,
    phone text,
    avatar_url text,
    must_change_password boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.profiles REPLICA IDENTITY FULL;


--
-- Name: user_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_permissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    permission public.app_permission NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.user_permissions REPLICA IDENTITY FULL;


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role public.app_role NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.user_roles REPLICA IDENTITY FULL;


--
-- Name: vendors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vendors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_id uuid,
    store_name text NOT NULL,
    slug text,
    description text,
    cuisine text,
    phone text,
    address text,
    zone_id uuid,
    logo_url text,
    cover_url text,
    status public.vendor_status DEFAULT 'pending'::public.vendor_status NOT NULL,
    is_open boolean DEFAULT true NOT NULL,
    rating numeric(3,2) DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.vendors REPLICA IDENTITY FULL;


--
-- Name: zones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.zones (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    flat_fee numeric(10,2) DEFAULT 0 NOT NULL,
    eta_minutes integer DEFAULT 30 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.zones REPLICA IDENTITY FULL;


--
-- Name: app_settings app_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_settings
    ADD CONSTRAINT app_settings_pkey PRIMARY KEY (id);


--
-- Name: chat_messages chat_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_pkey PRIMARY KEY (id);


--
-- Name: chat_threads chat_threads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_threads
    ADD CONSTRAINT chat_threads_pkey PRIMARY KEY (id);


--
-- Name: chat_threads chat_threads_vendor_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_threads
    ADD CONSTRAINT chat_threads_vendor_id_key UNIQUE (vendor_id);


--
-- Name: menu_items menu_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_items
    ADD CONSTRAINT menu_items_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: order_status_events order_status_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_status_events
    ADD CONSTRAINT order_status_events_pkey PRIMARY KEY (id);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: orders orders_tracking_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_tracking_no_key UNIQUE (tracking_no);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: user_permissions user_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_permissions
    ADD CONSTRAINT user_permissions_pkey PRIMARY KEY (id);


--
-- Name: user_permissions user_permissions_user_id_permission_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_permissions
    ADD CONSTRAINT user_permissions_user_id_permission_key UNIQUE (user_id, permission);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_user_id_role_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);


--
-- Name: vendors vendors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendors
    ADD CONSTRAINT vendors_pkey PRIMARY KEY (id);


--
-- Name: vendors vendors_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendors
    ADD CONSTRAINT vendors_slug_key UNIQUE (slug);


--
-- Name: zones zones_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zones
    ADD CONSTRAINT zones_name_key UNIQUE (name);


--
-- Name: zones zones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zones
    ADD CONSTRAINT zones_pkey PRIMARY KEY (id);


--
-- Name: menu_items menu_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER menu_updated BEFORE UPDATE ON public.menu_items FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();


--
-- Name: orders orders_log_status; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER orders_log_status AFTER INSERT OR UPDATE OF status ON public.orders FOR EACH ROW EXECUTE FUNCTION public.tg_log_order_status();


--
-- Name: orders orders_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER orders_updated BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();


--
-- Name: profiles profiles_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();


--
-- Name: app_settings settings_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER settings_updated BEFORE UPDATE ON public.app_settings FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();


--
-- Name: vendors vendors_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER vendors_updated BEFORE UPDATE ON public.vendors FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();


--
-- Name: zones zones_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER zones_updated BEFORE UPDATE ON public.zones FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();


--
-- Name: chat_messages chat_messages_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: chat_messages chat_messages_thread_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES public.chat_threads(id) ON DELETE CASCADE;


--
-- Name: chat_threads chat_threads_vendor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_threads
    ADD CONSTRAINT chat_threads_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES public.vendors(id) ON DELETE CASCADE;


--
-- Name: menu_items menu_items_vendor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_items
    ADD CONSTRAINT menu_items_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES public.vendors(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: order_status_events order_status_events_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_status_events
    ADD CONSTRAINT order_status_events_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: order_status_events order_status_events_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_status_events
    ADD CONSTRAINT order_status_events_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: orders orders_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: orders orders_vendor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES public.vendors(id) ON DELETE SET NULL;


--
-- Name: orders orders_zone_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_zone_id_fkey FOREIGN KEY (zone_id) REFERENCES public.zones(id) ON DELETE SET NULL;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_permissions user_permissions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_permissions
    ADD CONSTRAINT user_permissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: vendors vendors_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendors
    ADD CONSTRAINT vendors_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: vendors vendors_zone_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendors
    ADD CONSTRAINT vendors_zone_id_fkey FOREIGN KEY (zone_id) REFERENCES public.zones(id) ON DELETE SET NULL;


--
-- Name: app_settings App settings public read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "App settings public read" ON public.app_settings FOR SELECT USING (true);


--
-- Name: orders admin_read_orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_read_orders ON public.orders FOR SELECT USING ((public.has_permission(auth.uid(), 'manage_orders'::public.app_permission) OR public.is_admin(auth.uid())));


--
-- Name: user_permissions admin_read_perms; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_read_perms ON public.user_permissions FOR SELECT USING (public.is_admin(auth.uid()));


--
-- Name: profiles admin_read_profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_read_profiles ON public.profiles FOR SELECT USING (public.is_admin(auth.uid()));


--
-- Name: user_roles admin_read_roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_read_roles ON public.user_roles FOR SELECT USING (public.is_admin(auth.uid()));


--
-- Name: profiles admin_update_profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_update_profiles ON public.profiles FOR UPDATE USING (public.is_admin(auth.uid()));


--
-- Name: orders anon_track_by_no; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY anon_track_by_no ON public.orders FOR SELECT TO anon USING (true);


--
-- Name: vendors anyone_read_approved_vendors; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY anyone_read_approved_vendors ON public.vendors FOR SELECT USING (((status = 'approved'::public.vendor_status) OR (auth.uid() = owner_id) OR public.is_admin(auth.uid())));


--
-- Name: menu_items anyone_read_menu; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY anyone_read_menu ON public.menu_items FOR SELECT USING (true);


--
-- Name: app_settings anyone_read_settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY anyone_read_settings ON public.app_settings FOR SELECT USING (true);


--
-- Name: zones anyone_read_zones; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY anyone_read_zones ON public.zones FOR SELECT USING (true);


--
-- Name: app_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_threads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chat_threads ENABLE ROW LEVEL SECURITY;

--
-- Name: orders customer_insert_order; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY customer_insert_order ON public.orders FOR INSERT WITH CHECK ((auth.uid() = customer_id));


--
-- Name: orders customer_read_own_orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY customer_read_own_orders ON public.orders FOR SELECT USING ((auth.uid() = customer_id));


--
-- Name: order_status_events events_insert_authorized; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY events_insert_authorized ON public.order_status_events FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.orders o
  WHERE ((o.id = order_status_events.order_id) AND ((EXISTS ( SELECT 1
           FROM public.vendors v
          WHERE ((v.id = o.vendor_id) AND (v.owner_id = auth.uid())))) OR public.has_permission(auth.uid(), 'manage_orders'::public.app_permission))))));


--
-- Name: order_status_events events_read_anon; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY events_read_anon ON public.order_status_events FOR SELECT TO anon USING (true);


--
-- Name: order_status_events events_read_party; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY events_read_party ON public.order_status_events FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.orders o
  WHERE ((o.id = order_status_events.order_id) AND ((o.customer_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.vendors v
          WHERE ((v.id = o.vendor_id) AND (v.owner_id = auth.uid())))) OR public.is_admin(auth.uid()))))));


--
-- Name: menu_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;

--
-- Name: menu_items menu_owner_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY menu_owner_write ON public.menu_items USING (((EXISTS ( SELECT 1
   FROM public.vendors v
  WHERE ((v.id = menu_items.vendor_id) AND (v.owner_id = auth.uid())))) OR public.has_permission(auth.uid(), 'manage_menu'::public.app_permission))) WITH CHECK (((EXISTS ( SELECT 1
   FROM public.vendors v
  WHERE ((v.id = menu_items.vendor_id) AND (v.owner_id = auth.uid())))) OR public.has_permission(auth.uid(), 'manage_menu'::public.app_permission)));


--
-- Name: chat_messages msg_insert_party; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY msg_insert_party ON public.chat_messages FOR INSERT WITH CHECK (((auth.uid() = sender_id) AND (EXISTS ( SELECT 1
   FROM (public.chat_threads t
     JOIN public.vendors v ON ((v.id = t.vendor_id)))
  WHERE ((t.id = chat_messages.thread_id) AND ((v.owner_id = auth.uid()) OR public.has_permission(auth.uid(), 'manage_chat'::public.app_permission) OR public.is_admin(auth.uid())))))));


--
-- Name: chat_messages msg_read_party; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY msg_read_party ON public.chat_messages FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.chat_threads t
     JOIN public.vendors v ON ((v.id = t.vendor_id)))
  WHERE ((t.id = chat_messages.thread_id) AND ((v.owner_id = auth.uid()) OR public.has_permission(auth.uid(), 'manage_chat'::public.app_permission) OR public.is_admin(auth.uid()))))));


--
-- Name: notifications notif_self_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notif_self_read ON public.notifications FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: notifications notif_self_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notif_self_update ON public.notifications FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: order_status_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.order_status_events ENABLE ROW LEVEL SECURITY;

--
-- Name: orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles self_insert_profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY self_insert_profile ON public.profiles FOR INSERT WITH CHECK ((auth.uid() = id));


--
-- Name: user_permissions self_read_perms; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY self_read_perms ON public.user_permissions FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: profiles self_read_profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY self_read_profile ON public.profiles FOR SELECT USING ((auth.uid() = id));


--
-- Name: user_roles self_read_roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY self_read_roles ON public.user_roles FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: profiles self_update_profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY self_update_profile ON public.profiles FOR UPDATE USING ((auth.uid() = id));


--
-- Name: app_settings settings_admin_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY settings_admin_update ON public.app_settings FOR UPDATE USING (public.has_permission(auth.uid(), 'manage_settings'::public.app_permission));


--
-- Name: chat_threads thread_insert_party; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY thread_insert_party ON public.chat_threads FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM public.vendors v
  WHERE ((v.id = chat_threads.vendor_id) AND (v.owner_id = auth.uid())))) OR public.has_permission(auth.uid(), 'manage_chat'::public.app_permission)));


--
-- Name: chat_threads thread_read_party; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY thread_read_party ON public.chat_threads FOR SELECT USING (((EXISTS ( SELECT 1
   FROM public.vendors v
  WHERE ((v.id = chat_threads.vendor_id) AND (v.owner_id = auth.uid())))) OR public.has_permission(auth.uid(), 'manage_chat'::public.app_permission) OR public.is_admin(auth.uid())));


--
-- Name: user_permissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

--
-- Name: user_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: vendors vendor_admin_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vendor_admin_delete ON public.vendors FOR DELETE USING (public.has_permission(auth.uid(), 'manage_vendors'::public.app_permission));


--
-- Name: orders vendor_read_their_orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vendor_read_their_orders ON public.orders FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.vendors v
  WHERE ((v.id = orders.vendor_id) AND (v.owner_id = auth.uid())))));


--
-- Name: vendors vendor_self_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vendor_self_insert ON public.vendors FOR INSERT WITH CHECK ((auth.uid() = owner_id));


--
-- Name: vendors vendor_self_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vendor_self_update ON public.vendors FOR UPDATE USING (((auth.uid() = owner_id) OR public.has_permission(auth.uid(), 'manage_vendors'::public.app_permission)));


--
-- Name: orders vendor_update_order; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vendor_update_order ON public.orders FOR UPDATE USING (((EXISTS ( SELECT 1
   FROM public.vendors v
  WHERE ((v.id = orders.vendor_id) AND (v.owner_id = auth.uid())))) OR public.has_permission(auth.uid(), 'manage_orders'::public.app_permission)));


--
-- Name: vendors; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;

--
-- Name: zones; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.zones ENABLE ROW LEVEL SECURITY;

--
-- Name: zones zones_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY zones_admin_write ON public.zones USING (public.has_permission(auth.uid(), 'manage_zones'::public.app_permission)) WITH CHECK (public.has_permission(auth.uid(), 'manage_zones'::public.app_permission));


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;
-- -- GRANT USAGE ON SCHEMA public TO sandbox_exec;


--
-- Name: FUNCTION handle_new_user(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.handle_new_user() TO anon;
GRANT ALL ON FUNCTION public.handle_new_user() TO authenticated;
GRANT ALL ON FUNCTION public.handle_new_user() TO service_role;
-- GRANT ALL ON FUNCTION public.handle_new_user() TO sandbox_exec;


--
-- Name: FUNCTION has_permission(_user_id uuid, _permission public.app_permission); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.has_permission(_user_id uuid, _permission public.app_permission) TO anon;
GRANT ALL ON FUNCTION public.has_permission(_user_id uuid, _permission public.app_permission) TO authenticated;
GRANT ALL ON FUNCTION public.has_permission(_user_id uuid, _permission public.app_permission) TO service_role;
-- GRANT ALL ON FUNCTION public.has_permission(_user_id uuid, _permission public.app_permission) TO sandbox_exec;


--
-- Name: FUNCTION has_role(_user_id uuid, _role public.app_role); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.has_role(_user_id uuid, _role public.app_role) TO anon;
GRANT ALL ON FUNCTION public.has_role(_user_id uuid, _role public.app_role) TO authenticated;
GRANT ALL ON FUNCTION public.has_role(_user_id uuid, _role public.app_role) TO service_role;
-- GRANT ALL ON FUNCTION public.has_role(_user_id uuid, _role public.app_role) TO sandbox_exec;


--
-- Name: FUNCTION is_admin(_user_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.is_admin(_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_admin(_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_admin(_user_id uuid) TO service_role;
-- GRANT ALL ON FUNCTION public.is_admin(_user_id uuid) TO sandbox_exec;


--
-- Name: FUNCTION tg_log_order_status(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.tg_log_order_status() TO anon;
GRANT ALL ON FUNCTION public.tg_log_order_status() TO authenticated;
GRANT ALL ON FUNCTION public.tg_log_order_status() TO service_role;
-- GRANT ALL ON FUNCTION public.tg_log_order_status() TO sandbox_exec;


--
-- Name: FUNCTION tg_set_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.tg_set_updated_at() TO anon;
GRANT ALL ON FUNCTION public.tg_set_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.tg_set_updated_at() TO service_role;
-- GRANT ALL ON FUNCTION public.tg_set_updated_at() TO sandbox_exec;


--
-- Name: TABLE app_settings; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.app_settings TO anon;
GRANT ALL ON TABLE public.app_settings TO authenticated;
GRANT ALL ON TABLE public.app_settings TO service_role;
-- GRANT SELECT,INSERT ON TABLE public.app_settings TO sandbox_exec;


--
-- Name: TABLE chat_messages; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.chat_messages TO anon;
GRANT ALL ON TABLE public.chat_messages TO authenticated;
GRANT ALL ON TABLE public.chat_messages TO service_role;
-- GRANT SELECT,INSERT ON TABLE public.chat_messages TO sandbox_exec;


--
-- Name: TABLE chat_threads; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.chat_threads TO anon;
GRANT ALL ON TABLE public.chat_threads TO authenticated;
GRANT ALL ON TABLE public.chat_threads TO service_role;
-- GRANT SELECT,INSERT ON TABLE public.chat_threads TO sandbox_exec;


--
-- Name: TABLE menu_items; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.menu_items TO anon;
GRANT ALL ON TABLE public.menu_items TO authenticated;
GRANT ALL ON TABLE public.menu_items TO service_role;
-- GRANT SELECT,INSERT ON TABLE public.menu_items TO sandbox_exec;


--
-- Name: TABLE notifications; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.notifications TO anon;
GRANT ALL ON TABLE public.notifications TO authenticated;
GRANT ALL ON TABLE public.notifications TO service_role;
-- GRANT SELECT,INSERT ON TABLE public.notifications TO sandbox_exec;


--
-- Name: TABLE order_status_events; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.order_status_events TO anon;
GRANT ALL ON TABLE public.order_status_events TO authenticated;
GRANT ALL ON TABLE public.order_status_events TO service_role;
-- GRANT SELECT,INSERT ON TABLE public.order_status_events TO sandbox_exec;


--
-- Name: TABLE orders; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.orders TO anon;
GRANT ALL ON TABLE public.orders TO authenticated;
GRANT ALL ON TABLE public.orders TO service_role;
-- GRANT SELECT,INSERT ON TABLE public.orders TO sandbox_exec;


--
-- Name: TABLE profiles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.profiles TO anon;
GRANT ALL ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;
-- GRANT SELECT,INSERT ON TABLE public.profiles TO sandbox_exec;


--
-- Name: TABLE user_permissions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_permissions TO anon;
GRANT ALL ON TABLE public.user_permissions TO authenticated;
GRANT ALL ON TABLE public.user_permissions TO service_role;
-- GRANT SELECT,INSERT ON TABLE public.user_permissions TO sandbox_exec;


--
-- Name: TABLE user_roles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_roles TO anon;
GRANT ALL ON TABLE public.user_roles TO authenticated;
GRANT ALL ON TABLE public.user_roles TO service_role;
-- GRANT SELECT,INSERT ON TABLE public.user_roles TO sandbox_exec;


--
-- Name: TABLE vendors; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vendors TO anon;
GRANT ALL ON TABLE public.vendors TO authenticated;
GRANT ALL ON TABLE public.vendors TO service_role;
-- GRANT SELECT,INSERT ON TABLE public.vendors TO sandbox_exec;


--
-- Name: TABLE zones; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.zones TO anon;
GRANT ALL ON TABLE public.zones TO authenticated;
GRANT ALL ON TABLE public.zones TO service_role;
-- GRANT SELECT,INSERT ON TABLE public.zones TO sandbox_exec;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

-- ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
-- ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
-- ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
-- ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;
-- ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT,USAGE ON SEQUENCES TO sandbox_exec;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

-- ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
-- ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
-- ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
-- ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

-- ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
-- ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
-- ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
-- ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;
-- ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO sandbox_exec;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

-- ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
-- ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
-- ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
-- ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

-- ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
-- ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
-- ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
-- ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;
-- ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT,INSERT ON TABLES TO sandbox_exec;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

-- ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO postgres;
-- ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon;
-- ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
-- ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- PostgreSQL database dump complete
--



-- Auth signup trigger (creates profile + role row for new users)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
