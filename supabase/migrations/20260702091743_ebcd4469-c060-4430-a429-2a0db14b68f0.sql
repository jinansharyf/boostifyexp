ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS opening_hours JSONB;
NOTIFY pgrst, 'reload schema';