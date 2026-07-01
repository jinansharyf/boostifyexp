-- Custom order form fields configured by admin, rendered in the partner order dialog.
CREATE TABLE IF NOT EXISTS public.order_form_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section text NOT NULL CHECK (section IN ('customer','delivery','other')),
  label text NOT NULL,
  field_key text NOT NULL,
  field_type text NOT NULL CHECK (field_type IN ('text','textarea','number','select')),
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  required boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (field_key)
);

GRANT SELECT ON public.order_form_fields TO authenticated;
GRANT ALL ON public.order_form_fields TO service_role;

ALTER TABLE public.order_form_fields ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "order_form_fields read auth" ON public.order_form_fields;
CREATE POLICY "order_form_fields read auth" ON public.order_form_fields
  FOR SELECT TO authenticated USING (true);

-- reload PostgREST schema cache so /admin/setup checks see the changes immediately
NOTIFY pgrst, 'reload schema';
