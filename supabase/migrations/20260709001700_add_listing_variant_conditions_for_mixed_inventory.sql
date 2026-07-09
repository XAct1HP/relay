ALTER TABLE public.listing_variants
  ADD COLUMN IF NOT EXISTS condition TEXT;

UPDATE public.listing_variants AS lv
SET condition = CASE
  WHEN l.condition = 'new' THEN 'new'
  ELSE 'used'
END
FROM public.listings AS l
WHERE l.id = lv.listing_id
  AND (lv.condition IS NULL OR lv.condition NOT IN ('new', 'used'));

ALTER TABLE public.listing_variants
  ALTER COLUMN condition SET DEFAULT 'new';

ALTER TABLE public.listing_variants
  ALTER COLUMN condition SET NOT NULL;

ALTER TABLE public.listing_variants
  DROP CONSTRAINT IF EXISTS listing_variants_listing_id_size_key;

ALTER TABLE public.listing_variants
  DROP CONSTRAINT IF EXISTS listing_variants_condition_check;

ALTER TABLE public.listing_variants
  ADD CONSTRAINT listing_variants_condition_check
  CHECK (condition IN ('new', 'used'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_listing_variants_listing_size_condition_unique
  ON public.listing_variants(listing_id, size, condition);

CREATE OR REPLACE FUNCTION public.sync_listing_from_variants(target_listing_id UUID)
RETURNS VOID AS $$
DECLARE
  aggregated_sizes JSONB;
  available_variant_count INT;
BEGIN
  SELECT
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'size', size,
          'price', price,
          'quantity', quantity,
          'condition', condition
        )
        ORDER BY size, condition
      ) FILTER (WHERE is_active = true),
      '[]'::jsonb
    ),
    COUNT(*) FILTER (WHERE is_active = true AND quantity > 0)
  INTO aggregated_sizes, available_variant_count
  FROM public.listing_variants
  WHERE listing_id = target_listing_id;

  UPDATE public.listings
  SET
    sizes = aggregated_sizes,
    status = CASE
      WHEN status = 'sold_out' AND available_variant_count > 0 THEN 'active'
      WHEN status = 'active' AND available_variant_count <= 0 THEN 'sold_out'
      ELSE status
    END
  WHERE id = target_listing_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

SELECT public.sync_listing_from_variants(id) FROM public.listings;
