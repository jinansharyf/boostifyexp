-- Adds a JSONB opening_hours schedule to vendors so partners can advertise operating hours.
-- Shape: { tz?: string, days: [{ closed: bool, open: "HH:MM", close: "HH:MM" }] } — 7 entries, Sunday..Saturday.
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS opening_hours JSONB;
NOTIFY pgrst, 'reload schema';