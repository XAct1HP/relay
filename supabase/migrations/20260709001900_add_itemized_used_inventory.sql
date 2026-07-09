CREATE TABLE IF NOT EXISTS public.listing_used_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  listing_id UUID NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  size TEXT NOT NULL CHECK (btrim(size) <> ''),
  price NUMERIC(10, 2) NOT NULL CHECK (price > 0),
  quantity INT NOT NULL DEFAULT 1 CHECK (quantity = 1),
  condition TEXT NOT NULL DEFAULT 'used_good'
    CHECK (condition IN ('like_new', 'used_excellent', 'used_good', 'used_fair')),
  condition_photo_url TEXT NOT NULL CHECK (btrim(condition_photo_url) <> ''),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_listing_used_items_listing_photo_unique
  ON public.listing_used_items(listing_id, condition_photo_url);

CREATE INDEX IF NOT EXISTS idx_listing_used_items_listing_id
  ON public.listing_used_items(listing_id);

CREATE INDEX IF NOT EXISTS idx_listing_used_items_active
  ON public.listing_used_items(listing_id, is_active);

CREATE TRIGGER update_listing_used_items_updated_at
  BEFORE UPDATE ON public.listing_used_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.custom_offers
  ADD COLUMN IF NOT EXISTS listing_used_item_id UUID REFERENCES public.listing_used_items(id) ON DELETE SET NULL;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS listing_used_item_id UUID REFERENCES public.listing_used_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_custom_offers_listing_used_item_id
  ON public.custom_offers(listing_used_item_id);

CREATE INDEX IF NOT EXISTS idx_orders_listing_used_item_id
  ON public.orders(listing_used_item_id);

ALTER TABLE public.custom_offers
  DROP CONSTRAINT IF EXISTS custom_offers_single_inventory_target_check;

ALTER TABLE public.custom_offers
  ADD CONSTRAINT custom_offers_single_inventory_target_check
  CHECK (num_nonnulls(listing_variant_id, listing_used_item_id) <= 1);

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_single_inventory_target_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_single_inventory_target_check
  CHECK (num_nonnulls(listing_variant_id, listing_used_item_id) <= 1);

ALTER TABLE public.listing_used_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can read listing used items" ON public.listing_used_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.listings
      WHERE public.listings.id = public.listing_used_items.listing_id
        AND (
          public.listings.status = 'active'
          OR public.listings.seller_id = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM public.profiles
            WHERE public.profiles.id = auth.uid()
              AND public.profiles.role = 'admin'
          )
          OR EXISTS (
            SELECT 1
            FROM public.orders
            WHERE public.orders.listing_id = public.listing_used_items.listing_id
              AND (
                public.orders.buyer_id = auth.uid()
                OR public.orders.seller_id = auth.uid()
              )
          )
        )
    )
  );

CREATE POLICY "Sellers can insert listing used items" ON public.listing_used_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.listings
      WHERE public.listings.id = public.listing_used_items.listing_id
        AND (
          public.listings.seller_id = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM public.profiles
            WHERE public.profiles.id = auth.uid()
              AND public.profiles.role = 'admin'
          )
        )
    )
  );

CREATE POLICY "Sellers can update listing used items" ON public.listing_used_items
  FOR UPDATE USING (
    EXISTS (
      SELECT 1
      FROM public.listings
      WHERE public.listings.id = public.listing_used_items.listing_id
        AND (
          public.listings.seller_id = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM public.profiles
            WHERE public.profiles.id = auth.uid()
              AND public.profiles.role = 'admin'
          )
        )
    )
  );

CREATE POLICY "Sellers can delete listing used items" ON public.listing_used_items
  FOR DELETE USING (
    EXISTS (
      SELECT 1
      FROM public.listings
      WHERE public.listings.id = public.listing_used_items.listing_id
        AND (
          public.listings.seller_id = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM public.profiles
            WHERE public.profiles.id = auth.uid()
              AND public.profiles.role = 'admin'
          )
        )
    )
  );
