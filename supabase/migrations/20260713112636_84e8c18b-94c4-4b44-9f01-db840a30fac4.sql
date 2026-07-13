-- Duty logs for staff shift on/off events
CREATE TABLE IF NOT EXISTS public.staff_duty_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('on','off')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS staff_duty_logs_user_created_idx
  ON public.staff_duty_logs(user_id, created_at DESC);

GRANT SELECT, INSERT ON public.staff_duty_logs TO authenticated;
GRANT ALL ON public.staff_duty_logs TO service_role;

ALTER TABLE public.staff_duty_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff sees own duty logs" ON public.staff_duty_logs;
CREATE POLICY "staff sees own duty logs" ON public.staff_duty_logs
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "staff inserts own duty logs" ON public.staff_duty_logs;
CREATE POLICY "staff inserts own duty logs" ON public.staff_duty_logs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

NOTIFY pgrst, 'reload schema';