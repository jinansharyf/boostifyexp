-- 0024_staff_assignment_commission.sql
-- Run in your Supabase SQL editor.
-- IMPORTANT: The two ALTER TYPE statements at the top must each be run
-- OUTSIDE of a transaction. In the Supabase SQL editor, just run this file
-- and it will work; if you paste into psql, run the ALTER TYPE lines first.

-- 1) Add missing order status values so rejecting an order stops erroring.
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'rejected';
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'ready_for_pickup';

-- 2) Track which delivery staff is working each order + commission earned.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS picked_up_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS picked_up_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS commission_pct numeric(6,2),
  ADD COLUMN IF NOT EXISTS commission_amount numeric(10,2);

CREATE INDEX IF NOT EXISTS orders_assigned_to_idx ON public.orders(assigned_to);
CREATE INDEX IF NOT EXISTS orders_picked_up_by_idx ON public.orders(picked_up_by);

-- 3) Delivery-price × staff commission %
ALTER TABLE public.delivery_prices
  ADD COLUMN IF NOT EXISTS staff_commission_pct numeric(6,2) NOT NULL DEFAULT 0;

-- 4) Also void billing entries when an order is rejected.
CREATE OR REPLACE FUNCTION public.tg_void_billing_on_cancel() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IN ('cancelled','rejected') AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    UPDATE public.partner_billing_entries
       SET status = 'void'
     WHERE order_id = NEW.id AND status = 'unpaid';
  END IF;
  RETURN NEW;
END; $$;

-- 5) Only admins can change a partner's billing cycle.
CREATE OR REPLACE FUNCTION public.tg_protect_billing_cycle() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.billing_cycle IS DISTINCT FROM OLD.billing_cycle THEN
    IF NOT public.is_admin(auth.uid()) THEN
      RAISE EXCEPTION 'Only admins can change the billing cycle';
    END IF;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS vendors_protect_billing_cycle ON public.vendors;
CREATE TRIGGER vendors_protect_billing_cycle
  BEFORE UPDATE ON public.vendors
  FOR EACH ROW EXECUTE FUNCTION public.tg_protect_billing_cycle();

-- 6) Drivers can only read orders assigned to them (or pickable-unassigned in their zones).
DROP POLICY IF EXISTS orders_read_staff ON public.orders;
CREATE POLICY orders_read_staff ON public.orders FOR SELECT TO authenticated
USING (
  public.is_staff(auth.uid()) AND (
    assigned_to = auth.uid()
    OR delivered_by = auth.uid()
    OR picked_up_by = auth.uid()
    OR (
      assigned_to IS NULL
      AND status IN ('pending','ready_for_pickup','accepted')
      AND (
        public.staff_can_see_zone(auth.uid(), pickup_zone_id)
        OR public.staff_can_see_zone(auth.uid(), zone_id)
      )
    )
  )
);

DROP POLICY IF EXISTS orders_update_staff ON public.orders;
CREATE POLICY orders_update_staff ON public.orders FOR UPDATE TO authenticated
USING (
  public.is_staff(auth.uid()) AND (
    assigned_to = auth.uid()
    OR (assigned_to IS NULL AND (
      public.staff_can_see_zone(auth.uid(), pickup_zone_id)
      OR public.staff_can_see_zone(auth.uid(), zone_id)
    ))
  )
)
WITH CHECK (public.is_staff(auth.uid()));

NOTIFY pgrst, 'reload schema';