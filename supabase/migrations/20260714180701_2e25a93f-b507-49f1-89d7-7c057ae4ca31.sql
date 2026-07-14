BEGIN;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS picked_by uuid;

CREATE INDEX IF NOT EXISTS orders_picked_by_idx ON public.orders(picked_by);

-- Backfill any already picked or in-progress orders that only had delivered-by recorded.
UPDATE public.orders
SET picked_by = delivered_by
WHERE picked_by IS NULL
  AND delivered_by IS NOT NULL
  AND status IN ('picked_up', 'on_the_way', 'delivered');

NOTIFY pgrst, 'reload schema';
COMMIT;