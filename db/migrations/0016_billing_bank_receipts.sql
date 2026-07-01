-- Admin bank details on app_settings + partner-submitted payment receipts

ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS bank_name text,
  ADD COLUMN IF NOT EXISTS bank_account_name text,
  ADD COLUMN IF NOT EXISTS bank_account_number text,
  ADD COLUMN IF NOT EXISTS bank_branch text,
  ADD COLUMN IF NOT EXISTS bank_iban text,
  ADD COLUMN IF NOT EXISTS bank_swift text,
  ADD COLUMN IF NOT EXISTS bank_instructions text;

-- Extend partner_payments so partners can submit receipts for admin verification
ALTER TABLE public.partner_payments
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'verified'
    CHECK (status IN ('pending','verified','rejected')),
  ADD COLUMN IF NOT EXISTS receipt_url text,
  ADD COLUMN IF NOT EXISTS reference text,
  ADD COLUMN IF NOT EXISTS period_key text,
  ADD COLUMN IF NOT EXISTS cycle text CHECK (cycle IN ('weekly','monthly')),
  ADD COLUMN IF NOT EXISTS submitted_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS verified_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_reason text;

-- Allow partners to submit their own payment records (pending state)
DROP POLICY IF EXISTS "payments partner insert own" ON public.partner_payments;
CREATE POLICY "payments partner insert own" ON public.partner_payments
  FOR INSERT TO authenticated
  WITH CHECK (
    status = 'pending'
    AND submitted_by = auth.uid()
    AND EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = partner_id AND v.owner_id = auth.uid())
  );

-- Partners can update their own still-pending submissions (e.g. re-upload receipt)
DROP POLICY IF EXISTS "payments partner update pending" ON public.partner_payments;
CREATE POLICY "payments partner update pending" ON public.partner_payments
  FOR UPDATE TO authenticated
  USING (
    status = 'pending'
    AND EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = partner_id AND v.owner_id = auth.uid())
  )
  WITH CHECK (
    status = 'pending'
    AND EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = partner_id AND v.owner_id = auth.uid())
  );

NOTIFY pgrst, 'reload schema';