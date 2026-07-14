BEGIN;

-- Add ready_for_pickup to the order status list if the database does not have it yet.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'order_status'
      AND t.typnamespace = 'public'::regnamespace
      AND e.enumlabel = 'ready_for_pickup'
  ) THEN
    ALTER TYPE public.order_status ADD VALUE 'ready_for_pickup' BEFORE 'picked_up';
  END IF;
END $$;

-- Staff roles and zone assignment tables used by the staff dashboard.
CREATE TABLE IF NOT EXISTS public.staff_members (
  user_id uuid PRIMARY KEY,
  staff_role text NOT NULL CHECK (staff_role IN ('manager', 'supervisor', 'officer')),
  telegram_chat_id text,
  notification_email text,
  email_notifications_enabled boolean NOT NULL DEFAULT true,
  on_shift boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.staff_members TO authenticated;
GRANT ALL ON public.staff_members TO service_role;
ALTER TABLE public.staff_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff_members self read" ON public.staff_members;
CREATE POLICY "staff_members self read" ON public.staff_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin(auth.uid()));
DROP POLICY IF EXISTS "staff_members admin write" ON public.staff_members;
CREATE POLICY "staff_members admin write" ON public.staff_members
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));
DROP TRIGGER IF EXISTS set_updated_at_staff_members ON public.staff_members;
CREATE TRIGGER set_updated_at_staff_members
  BEFORE UPDATE ON public.staff_members
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE IF NOT EXISTS public.staff_zones (
  user_id uuid NOT NULL,
  zone_id uuid NOT NULL REFERENCES public.zones(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, zone_id)
);
GRANT SELECT ON public.staff_zones TO authenticated;
GRANT ALL ON public.staff_zones TO service_role;
ALTER TABLE public.staff_zones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff_zones self read" ON public.staff_zones;
CREATE POLICY "staff_zones self read" ON public.staff_zones
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin(auth.uid()));
DROP POLICY IF EXISTS "staff_zones admin write" ON public.staff_zones;
CREATE POLICY "staff_zones admin write" ON public.staff_zones
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.staff_members WHERE user_id = _user_id);
$$;

CREATE OR REPLACE FUNCTION public.staff_can_see_zone(_user_id uuid, _zone_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.staff_zones
    WHERE user_id = _user_id
      AND zone_id = _zone_id
  );
$$;

-- Order fields needed by current order views and assignment tracking.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS pickup_zone_id uuid REFERENCES public.zones(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS vehicle_type_id uuid REFERENCES public.vehicle_types(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delivered_by uuid;

UPDATE public.orders
SET pickup_zone_id = COALESCE(pickup_zone_id, zone_id)
WHERE pickup_zone_id IS NULL;

CREATE INDEX IF NOT EXISTS orders_pickup_zone_id_idx ON public.orders(pickup_zone_id);
CREATE INDEX IF NOT EXISTS orders_vehicle_type_id_idx ON public.orders(vehicle_type_id);
CREATE INDEX IF NOT EXISTS orders_delivered_by_idx ON public.orders(delivered_by);
CREATE INDEX IF NOT EXISTS staff_members_role_idx ON public.staff_members(staff_role);
CREATE INDEX IF NOT EXISTS staff_zones_zone_id_idx ON public.staff_zones(zone_id);

-- Editable SMS routing/templates used by ready-for-pickup notifications.
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS sms_send_customer boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sms_send_vendor boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sms_send_staff boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sms_vendor_tpl_ready text,
  ADD COLUMN IF NOT EXISTS sms_staff_tpl_ready text,
  ADD COLUMN IF NOT EXISTS email_tpl_placed_subject text,
  ADD COLUMN IF NOT EXISTS email_tpl_placed_body text,
  ADD COLUMN IF NOT EXISTS email_tpl_placed_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_tpl_ready_subject text,
  ADD COLUMN IF NOT EXISTS email_tpl_ready_body text,
  ADD COLUMN IF NOT EXISTS email_tpl_ready_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_tpl_picked_subject text,
  ADD COLUMN IF NOT EXISTS email_tpl_picked_body text,
  ADD COLUMN IF NOT EXISTS email_tpl_picked_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_tpl_progress_subject text,
  ADD COLUMN IF NOT EXISTS email_tpl_progress_body text,
  ADD COLUMN IF NOT EXISTS email_tpl_progress_enabled boolean NOT NULL DEFAULT true;

UPDATE public.app_settings SET
  email_tpl_placed_subject = COALESCE(email_tpl_placed_subject, 'New order #{tracking} placed'),
  email_tpl_placed_body = COALESCE(email_tpl_placed_body, 'A new delivery order has been placed.<br><br>Tracking: <b>#{tracking}</b><br>Partner: {vendor}<br>Customer: {customer}<br>Phone: {phone}<br>Drop-off: {address}<br>Total: {total}<br><br><a href="{link}">Open dashboard</a>'),
  email_tpl_ready_subject = COALESCE(email_tpl_ready_subject, 'Order #{tracking} ready for pickup'),
  email_tpl_ready_body = COALESCE(email_tpl_ready_body, 'Order <b>#{tracking}</b> is ready for pickup.<br><br>Partner: {vendor}<br>Customer: {customer}<br>Phone: {phone}<br>Drop-off: {address}<br>Total: {total}<br><br><a href="{link}">Open order</a>'),
  email_tpl_picked_subject = COALESCE(email_tpl_picked_subject, 'Your order #{tracking} is on its way'),
  email_tpl_picked_body = COALESCE(email_tpl_picked_body, 'Hi {customer},<br><br>Your order <b>#{tracking}</b> from {vendor} has been picked up and is on the way.<br>Track: <a href="{link}">{link}</a>'),
  email_tpl_progress_subject = COALESCE(email_tpl_progress_subject, 'Order #{tracking} — {status}'),
  email_tpl_progress_body = COALESCE(email_tpl_progress_body, 'Hi {customer},<br><br>Your order <b>#{tracking}</b> from {vendor} is now <b>{status}</b>.<br>Track: <a href="{link}">{link}</a>'),
  sms_vendor_tpl_ready = COALESCE(sms_vendor_tpl_ready, 'Order #{tracking} is ready for pickup. Customer: {customer}. Drop-off: {address}.'),
  sms_staff_tpl_ready = COALESCE(sms_staff_tpl_ready, 'Pickup ready: #{tracking} from {vendor}. Customer: {customer}. Drop-off: {address}.')
WHERE id = 1;

-- Realtime for orders, guarded so it is safe to re-run.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
COMMIT;