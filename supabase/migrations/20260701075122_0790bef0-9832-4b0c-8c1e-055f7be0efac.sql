CREATE TABLE IF NOT EXISTS public.order_form_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section text NOT NULL CHECK (section IN ('customer','delivery','other')),
  label text NOT NULL,
  field_key text NOT NULL UNIQUE,
  field_type text NOT NULL CHECK (field_type IN ('text','textarea','number','select')),
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  required boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.order_form_fields TO authenticated;
GRANT ALL ON public.order_form_fields TO service_role;

ALTER TABLE public.order_form_fields ENABLE ROW LEVEL SECURITY;

CREATE POLICY "order_form_fields read auth"
  ON public.order_form_fields
  FOR SELECT
  TO authenticated
  USING (true);

CREATE TRIGGER order_form_fields_set_updated_at
  BEFORE UPDATE ON public.order_form_fields
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();