-- Ensure orders use the admin-configurable tracking number generator
ALTER TABLE public.orders ALTER COLUMN tracking_no DROP DEFAULT;
ALTER TABLE public.orders ALTER COLUMN tracking_no DROP NOT NULL;

DROP TRIGGER IF EXISTS set_order_tracking_no ON public.orders;
CREATE TRIGGER set_order_tracking_no
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_order_tracking_no();

DROP TRIGGER IF EXISTS log_order_status ON public.orders;
CREATE TRIGGER log_order_status
  AFTER INSERT OR UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.tg_log_order_status();

-- Backfill any existing orders that still have the old default-format tracking numbers
UPDATE public.orders
SET tracking_no = public.generate_order_tracking_no(created_at)
WHERE tracking_no ~ '^BST-[A-F0-9]{8}$';