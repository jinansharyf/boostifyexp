CREATE TABLE IF NOT EXISTS public.password_reset_requests (
  email text PRIMARY KEY,
  last_sent_at timestamptz NOT NULL DEFAULT now(),
  request_count integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.password_reset_requests TO service_role;

ALTER TABLE public.password_reset_requests ENABLE ROW LEVEL SECURITY;
-- reload PostgREST schema cache so /admin/setup checks see the changes immediately
NOTIFY pgrst, 'reload schema';
