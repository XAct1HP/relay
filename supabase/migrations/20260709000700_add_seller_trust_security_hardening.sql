-- Security hardening support for dispute-window exceptions.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS dispute_admin_exception_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dispute_admin_exception_reason TEXT;
