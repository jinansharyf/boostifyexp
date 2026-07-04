REVOKE ALL ON FUNCTION public.generate_order_tracking_no(timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_set_order_tracking_no() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_order_tracking_no(timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.tg_set_order_tracking_no() TO service_role;
NOTIFY pgrst, 'reload schema';