-- Migration 0020 — "Ready for pickup" status, editable email templates,
-- staff shift + email notification channels.
-- Fully idempotent. Safe to re-run.

BEGIN;

-- 1) Add 'ready_for_pickup' to the order_status enum (between accepted and picked_up)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'order_status' AND e.enumlabel = 'ready_for_pickup'
  ) THEN
    ALTER TYPE public.order_status ADD VALUE 'ready_for_pickup' BEFORE 'picked_up';
  END IF;
END $$;

-- 2) Admin-editable email templates + SMS routing on app_settings
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS email_tpl_placed_subject text,
  ADD COLUMN IF NOT EXISTS email_tpl_placed_body    text,
  ADD COLUMN IF NOT EXISTS email_tpl_placed_enabled boolean NOT NULL DEFAULT true,

  ADD COLUMN IF NOT EXISTS email_tpl_ready_subject  text,
  ADD COLUMN IF NOT EXISTS email_tpl_ready_body     text,
  ADD COLUMN IF NOT EXISTS email_tpl_ready_enabled  boolean NOT NULL DEFAULT true,

  ADD COLUMN IF NOT EXISTS email_tpl_picked_subject text,
  ADD COLUMN IF NOT EXISTS email_tpl_picked_body    text,
  ADD COLUMN IF NOT EXISTS email_tpl_picked_enabled boolean NOT NULL DEFAULT true,

  ADD COLUMN IF NOT EXISTS email_tpl_progress_subject text,
  ADD COLUMN IF NOT EXISTS email_tpl_progress_body    text,
  ADD COLUMN IF NOT EXISTS email_tpl_progress_enabled boolean NOT NULL DEFAULT true,

  -- Who receives SMS (per-audience master toggles). The existing per-status
  -- toggles (sms_enabled_picked / _on_the_way / _delivered) still apply.
  ADD COLUMN IF NOT EXISTS sms_send_customer boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sms_send_vendor   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sms_send_staff    boolean NOT NULL DEFAULT false,

  -- Optional SMS templates for the extra audiences (used on Ready)
  ADD COLUMN IF NOT EXISTS sms_vendor_tpl_ready text,
  ADD COLUMN IF NOT EXISTS sms_staff_tpl_ready  text;

-- Seed defaults for empty template rows so admins see something on first open
UPDATE public.app_settings SET
  email_tpl_placed_subject = COALESCE(email_tpl_placed_subject, 'New order #{tracking} placed'),
  email_tpl_placed_body    = COALESCE(email_tpl_placed_body,
    'A new delivery order has been placed.<br><br>' ||
    'Tracking: <b>#{tracking}</b><br>' ||
    'Customer: {customer}<br>Phone: {phone}<br>' ||
    'Drop-off: {address}<br>Total: {total}<br><br>' ||
    '<a href="{link}">Open dashboard</a>'),
  email_tpl_ready_subject  = COALESCE(email_tpl_ready_subject, 'Order #{tracking} ready for pickup'),
  email_tpl_ready_body     = COALESCE(email_tpl_ready_body,
    'Order <b>#{tracking}</b> is ready for pickup.<br><br>' ||
    'Customer: {customer}<br>Phone: {phone}<br>' ||
    'Drop-off: {address}<br>Total: {total}<br><br>' ||
    '<a href="{link}">Open order</a>'),
  email_tpl_picked_subject = COALESCE(email_tpl_picked_subject, 'Your order #{tracking} is on its way'),
  email_tpl_picked_body    = COALESCE(email_tpl_picked_body,
    'Hi {customer},<br><br>Your order <b>#{tracking}</b> has been picked up and is on the way.<br>' ||
    'Track: <a href="{link}">{link}</a>'),
  email_tpl_progress_subject = COALESCE(email_tpl_progress_subject, 'Order #{tracking} — {status}'),
  email_tpl_progress_body    = COALESCE(email_tpl_progress_body,
    'Hi {customer},<br><br>Your order <b>#{tracking}</b> is now <b>{status}</b>.<br>' ||
    'Track: <a href="{link}">{link}</a>')
WHERE id = 1;

-- 3) Staff notification channels: personal email, per-staff email toggle, on-shift toggle
ALTER TABLE public.staff_members
  ADD COLUMN IF NOT EXISTS notification_email          text,
  ADD COLUMN IF NOT EXISTS email_notifications_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS on_shift                    boolean NOT NULL DEFAULT true;

-- 4) Make sure PostgREST re-reads the schema cache
NOTIFY pgrst, 'reload schema';

COMMIT;