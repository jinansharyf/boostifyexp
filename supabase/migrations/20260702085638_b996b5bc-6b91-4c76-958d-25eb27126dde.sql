ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'rejected';
NOTIFY pgrst, 'reload schema';