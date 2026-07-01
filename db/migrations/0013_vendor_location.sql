-- Vendor geolocation (coarse; used for map links and future zone routing)
ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision;

NOTIFY pgrst, 'reload schema';