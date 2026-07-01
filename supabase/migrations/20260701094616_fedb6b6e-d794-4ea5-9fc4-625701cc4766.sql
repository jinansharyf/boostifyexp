
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
