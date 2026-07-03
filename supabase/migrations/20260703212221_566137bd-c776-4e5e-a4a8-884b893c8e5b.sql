
-- Restore Data-API grants for every table in the public schema.
-- setup.sql did not GRANT to anon/authenticated/service_role, so PostgREST
-- was returning permission-denied for every read, which made admin pages hang.

DO $$
DECLARE tbl record;
BEGIN
  FOR tbl IN
    SELECT c.relname AS table_name
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind='r' AND n.nspname='public'
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', tbl.table_name);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', tbl.table_name);
  END LOOP;
END $$;

-- Public-facing tables that legitimately allow anonymous read
GRANT SELECT ON public.app_settings TO anon;
GRANT SELECT ON public.zones        TO anon;
GRANT SELECT ON public.vendors      TO anon;
GRANT SELECT ON public.menu_items   TO anon;

NOTIFY pgrst, 'reload schema';
