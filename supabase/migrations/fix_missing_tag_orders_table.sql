-- ============================================================================
-- FIX MISSING TAG ORDERS TABLE
-- Follow-up migration for environments where Relay tag purchases shipped before
-- the underlying `tag_orders` table migration existed.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.tag_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  seller_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  bundle_id TEXT NOT NULL,
  bundle_name TEXT NOT NULL,
  quantity INT NOT NULL CHECK (quantity > 0),
  price_cents INT NOT NULL CHECK (price_cents >= 0),
  status TEXT NOT NULL DEFAULT 'paid' CHECK (status IN ('paid', 'processing', 'shipped', 'fulfilled')),
  stripe_checkout_session_id TEXT,
  stripe_payment_intent_id TEXT,
  shipping_tracking_number TEXT,
  shipping_carrier TEXT,
  admin_notes TEXT,
  paid_at TIMESTAMPTZ,
  shipped_at TIMESTAMPTZ,
  fulfilled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE IF EXISTS public.tag_orders
  ADD COLUMN IF NOT EXISTS seller_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS public.tag_orders
  ADD COLUMN IF NOT EXISTS bundle_id TEXT;
ALTER TABLE IF EXISTS public.tag_orders
  ADD COLUMN IF NOT EXISTS bundle_name TEXT;
ALTER TABLE IF EXISTS public.tag_orders
  ADD COLUMN IF NOT EXISTS quantity INT;
ALTER TABLE IF EXISTS public.tag_orders
  ADD COLUMN IF NOT EXISTS price_cents INT;
ALTER TABLE IF EXISTS public.tag_orders
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'paid';
ALTER TABLE IF EXISTS public.tag_orders
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id TEXT;
ALTER TABLE IF EXISTS public.tag_orders
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT;
ALTER TABLE IF EXISTS public.tag_orders
  ADD COLUMN IF NOT EXISTS shipping_tracking_number TEXT;
ALTER TABLE IF EXISTS public.tag_orders
  ADD COLUMN IF NOT EXISTS shipping_carrier TEXT;
ALTER TABLE IF EXISTS public.tag_orders
  ADD COLUMN IF NOT EXISTS admin_notes TEXT;
ALTER TABLE IF EXISTS public.tag_orders
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
ALTER TABLE IF EXISTS public.tag_orders
  ADD COLUMN IF NOT EXISTS shipped_at TIMESTAMPTZ;
ALTER TABLE IF EXISTS public.tag_orders
  ADD COLUMN IF NOT EXISTS fulfilled_at TIMESTAMPTZ;
ALTER TABLE IF EXISTS public.tag_orders
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE IF EXISTS public.tag_orders
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.tag_orders
  ALTER COLUMN seller_id SET NOT NULL;
ALTER TABLE public.tag_orders
  ALTER COLUMN bundle_id SET NOT NULL;
ALTER TABLE public.tag_orders
  ALTER COLUMN bundle_name SET NOT NULL;
ALTER TABLE public.tag_orders
  ALTER COLUMN quantity SET NOT NULL;
ALTER TABLE public.tag_orders
  ALTER COLUMN price_cents SET NOT NULL;
ALTER TABLE public.tag_orders
  ALTER COLUMN status SET NOT NULL;

ALTER TABLE public.tag_orders
  DROP CONSTRAINT IF EXISTS tag_orders_quantity_check;
ALTER TABLE public.tag_orders
  ADD CONSTRAINT tag_orders_quantity_check CHECK (quantity > 0);

ALTER TABLE public.tag_orders
  DROP CONSTRAINT IF EXISTS tag_orders_price_cents_check;
ALTER TABLE public.tag_orders
  ADD CONSTRAINT tag_orders_price_cents_check CHECK (price_cents >= 0);

ALTER TABLE public.tag_orders
  DROP CONSTRAINT IF EXISTS tag_orders_status_check;
ALTER TABLE public.tag_orders
  ADD CONSTRAINT tag_orders_status_check
  CHECK (status IN ('paid', 'processing', 'shipped', 'fulfilled'));

CREATE INDEX IF NOT EXISTS idx_tag_orders_seller_id ON public.tag_orders(seller_id);
CREATE INDEX IF NOT EXISTS idx_tag_orders_status ON public.tag_orders(status);
CREATE INDEX IF NOT EXISTS idx_tag_orders_paid_at ON public.tag_orders(paid_at);
CREATE INDEX IF NOT EXISTS idx_tag_orders_created_at ON public.tag_orders(created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tag_orders_stripe_checkout_session_id
  ON public.tag_orders(stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_tag_orders_stripe_payment_intent_id
  ON public.tag_orders(stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

ALTER TABLE public.tag_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Sellers can read their tag orders" ON public.tag_orders;
CREATE POLICY "Sellers can read their tag orders" ON public.tag_orders
  FOR SELECT USING (
    auth.uid() = seller_id OR
    EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can manage tag orders" ON public.tag_orders;
CREATE POLICY "Admins can manage tag orders" ON public.tag_orders
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_tag_orders_updated_at'
  ) THEN
    CREATE TRIGGER update_tag_orders_updated_at
      BEFORE UPDATE ON public.tag_orders
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

-- Refresh PostgREST schema cache so Preview/API routes can see the table
-- immediately after this migration is applied.
NOTIFY pgrst, 'reload schema';
