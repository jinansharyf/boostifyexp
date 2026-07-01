-- Partner billing cycle preference
ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS billing_cycle text NOT NULL DEFAULT 'weekly'
    CHECK (billing_cycle IN ('weekly','monthly'));

-- reload PostgREST schema cache so /admin/setup checks see the changes immediately
NOTIFY pgrst, 'reload schema';
