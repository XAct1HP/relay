-- ============================================================================
-- WITHDRAWAL REQUEST REVIEW + IDEMPOTENCY CONTROLS
-- ============================================================================
-- Adds explicit review/cancel tracking and a first-class idempotency key for
-- Relay Balance withdrawal requests.

ALTER TABLE public.withdrawal_requests
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS review_required BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_by_admin_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS review_notes TEXT,
  ADD COLUMN IF NOT EXISTS canceled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS canceled_by_admin_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_withdrawal_requests_idempotency_key_unique
  ON public.withdrawal_requests(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_review_required
  ON public.withdrawal_requests(review_required);

CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_reviewed_by_admin_id
  ON public.withdrawal_requests(reviewed_by_admin_id);

ALTER TABLE public.withdrawal_requests
  DROP CONSTRAINT IF EXISTS withdrawal_requests_review_required_status_check;

ALTER TABLE public.withdrawal_requests
  ADD CONSTRAINT withdrawal_requests_review_required_status_check CHECK (
    CASE
      WHEN review_required THEN status IN ('pending', 'processing', 'completed', 'failed', 'canceled')
      ELSE TRUE
    END
  );
