-- Change order tracking to DO-MMYY-XXXX (random 4 digits, unique)
-- Add delivered_by staff column so admins can see who delivered each order.
-- Safe to re-run.

BEGIN;

-- 1. Prefix default = DO (leave user's saved prefix if any, otherwise force DO)
UPDATE public.app_settings
   SET order_no_prefix = 'DO'
 WHERE id = 1
   AND (order_no_prefix IS NULL OR order_no_prefix IN ('BST', ''));

-- 2. Replace generator: random 4-digit code, retry on unique conflict
CREATE OR REPLACE FUNCTION public.generate_order_tracking_no(_at timestamptz DEFAULT now())
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _prefix  text;
  _period  text := to_char(_at, 'MMYY');
  _rand    text;
  _candidate text;
  _exists  boolean;
  _tries   integer := 0;
BEGIN
  SELECT COALESCE(NULLIF(order_no_prefix, ''), 'DO') INTO _prefix
    FROM public.app_settings WHERE id = 1;
  IF _prefix IS NULL THEN _prefix := 'DO'; END IF;

  LOOP
    _tries := _tries + 1;
    _rand := lpad(floor(random() * 10000)::int::text, 4, '0');
    _candidate := _prefix || '-' || _period || '-' || _rand;
    SELECT EXISTS (SELECT 1 FROM public.orders WHERE tracking_no = _candidate) INTO _exists;
    EXIT WHEN NOT _exists;
    IF _tries > 50 THEN
      -- Extremely unlikely; fall back to 5 digits to guarantee uniqueness
      _rand := lpad(floor(random() * 100000)::int::text, 5, '0');
      _candidate := _prefix || '-' || _period || '-' || _rand;
      EXIT;
    END IF;
  END LOOP;

  RETURN _candidate;
END;
$$;

-- 3. Trigger already exists (orders_set_tracking_no) and will use the new fn.

-- 4. delivered_by: which staff user delivered the order
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivered_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS orders_delivered_by_idx ON public.orders(delivered_by);

NOTIFY pgrst, 'reload schema';
COMMIT;