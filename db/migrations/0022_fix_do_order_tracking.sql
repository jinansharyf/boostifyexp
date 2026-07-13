-- Migration 0022 — force configurable order numbers to use the saved prefix
-- Fixes old databases where orders.tracking_no still had the legacy BST default.
-- Safe to re-run.

BEGIN;

-- Make sure the setting exists and defaults away from BST on older installs.
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS order_no_prefix text NOT NULL DEFAULT 'DO';

INSERT INTO public.app_settings (id, site_name)
VALUES (1, 'Boostify Express')
ON CONFLICT (id) DO NOTHING;

UPDATE public.app_settings
   SET order_no_prefix = 'DO'
 WHERE id = 1
   AND (order_no_prefix IS NULL OR btrim(order_no_prefix) = '' OR upper(order_no_prefix) = 'BST');

-- The legacy column default generated BST-XXXXXXXX before the trigger ran.
-- Remove it so the trigger/function is always the source of order numbers.
ALTER TABLE public.orders ALTER COLUMN tracking_no DROP DEFAULT;
ALTER TABLE public.orders ALTER COLUMN tracking_no DROP NOT NULL;

CREATE TABLE IF NOT EXISTS public.order_number_counters (
  period_key text PRIMARY KEY,
  last_seq integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.order_number_counters TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.order_number_counters TO service_role;
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
  _period text := to_char(_at, 'MMYY');
  _seq integer;
BEGIN
  SELECT upper(COALESCE(NULLIF(btrim(order_no_prefix), ''), 'DO'))
    INTO _prefix
    FROM public.app_settings
   WHERE id = 1;

  IF _prefix IS NULL OR _prefix = 'BST' THEN
    _prefix := 'DO';
  END IF;

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
  IF NEW.tracking_no IS NULL
     OR btrim(NEW.tracking_no) = ''
     OR NEW.tracking_no ~ '^BST-[A-F0-9]{8}$' THEN
    NEW.tracking_no := public.generate_order_tracking_no(COALESCE(NEW.created_at, now()));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_order_tracking_no ON public.orders;
DROP TRIGGER IF EXISTS orders_set_tracking_no ON public.orders;
CREATE TRIGGER orders_set_tracking_no
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_order_tracking_no();

-- Remove duplicate status-log triggers from older repair scripts.
DROP TRIGGER IF EXISTS log_order_status ON public.orders;
DROP TRIGGER IF EXISTS orders_log_status ON public.orders;
CREATE TRIGGER orders_log_status
  AFTER INSERT OR UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.tg_log_order_status();

REVOKE ALL ON FUNCTION public.generate_order_tracking_no(timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_set_order_tracking_no() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_order_tracking_no(timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.tg_set_order_tracking_no() TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;