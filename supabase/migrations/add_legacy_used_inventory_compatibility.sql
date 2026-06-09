ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS inventory_review_status TEXT
    CHECK (inventory_review_status IN ('legacy_used_photo_review_required'));

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS inventory_review_notes TEXT;

CREATE INDEX IF NOT EXISTS idx_listings_inventory_review_status
  ON public.listings(inventory_review_status)
  WHERE inventory_review_status IS NOT NULL;

WITH normalized_legacy_used AS (
  SELECT
    l.id AS listing_id,
    l.condition AS listing_condition,
    COALESCE(
      (
        SELECT array_agg(image_url)
        FROM unnest(COALESCE(l.images, ARRAY[]::TEXT[])) AS image_url
        WHERE btrim(image_url) <> ''
      ),
      ARRAY[]::TEXT[]
    ) AS cleaned_images,
    lv.id AS variant_id,
    lv.size,
    lv.price,
    lv.quantity,
    COUNT(*) OVER (PARTITION BY l.id) AS active_used_variant_rows,
    SUM(lv.quantity) OVER (PARTITION BY l.id) AS active_used_unit_count,
    COALESCE((
      SELECT COUNT(*)
      FROM public.listing_variants AS new_lv
      WHERE new_lv.listing_id = l.id
        AND new_lv.condition = 'new'
        AND new_lv.is_active = true
        AND new_lv.quantity > 0
    ), 0) AS active_new_variant_count,
    COALESCE((
      SELECT COUNT(*)
      FROM public.listing_used_items AS lui
      WHERE lui.listing_id = l.id
        AND lui.is_active = true
        AND lui.quantity > 0
    ), 0) AS active_used_item_count
  FROM public.listings AS l
  INNER JOIN public.listing_variants AS lv
    ON lv.listing_id = l.id
  WHERE l.status <> 'removed'
    AND lv.condition = 'used'
    AND lv.is_active = true
    AND lv.quantity > 0
),
safe_single_pair_candidates AS (
  SELECT *
  FROM normalized_legacy_used
  WHERE active_used_item_count = 0
    AND active_used_variant_rows = 1
    AND active_used_unit_count = 1
    AND COALESCE(array_length(cleaned_images, 1), 0) = 1
),
safe_used_item_backfill AS (
  INSERT INTO public.listing_used_items (
    listing_id,
    size,
    price,
    quantity,
    condition,
    condition_photo_url,
    is_active
  )
  SELECT
    listing_id,
    size,
    price,
    1,
    CASE
      WHEN listing_condition = 'like_new' THEN 'like_new'
      WHEN listing_condition = 'used_excellent' THEN 'used_excellent'
      WHEN listing_condition = 'used_fair' THEN 'used_fair'
      ELSE 'used_good'
    END,
    cleaned_images[1],
    true
  FROM safe_single_pair_candidates
  ON CONFLICT (listing_id, condition_photo_url) DO NOTHING
  RETURNING listing_id
),
review_required_listings AS (
  SELECT DISTINCT
    listing_id,
    active_new_variant_count,
    active_used_unit_count,
    active_used_item_count,
    COALESCE(array_length(cleaned_images, 1), 0) AS image_count
  FROM normalized_legacy_used
  WHERE NOT (
      active_used_variant_rows = 1
      AND active_used_item_count = 0
      AND active_used_unit_count = 1
      AND COALESCE(array_length(cleaned_images, 1), 0) = 1
    )
),
deactivate_legacy_used_variants AS (
  UPDATE public.listing_variants AS lv
  SET is_active = false
  WHERE lv.id IN (
    SELECT variant_id FROM safe_single_pair_candidates
    UNION
    SELECT legacy.variant_id
    FROM normalized_legacy_used AS legacy
    INNER JOIN review_required_listings AS review
      ON review.listing_id = legacy.listing_id
  )
  RETURNING lv.listing_id
)
UPDATE public.listings AS l
SET
  inventory_review_status = CASE
    WHEN EXISTS (
      SELECT 1
      FROM review_required_listings AS review
      WHERE review.listing_id = l.id
    )
      THEN 'legacy_used_photo_review_required'
    ELSE NULL
  END,
  inventory_review_notes = CASE
    WHEN EXISTS (
      SELECT 1
      FROM review_required_listings AS review
      WHERE review.listing_id = l.id
    )
      THEN CASE
        WHEN EXISTS (
          SELECT 1
          FROM review_required_listings AS review
          WHERE review.listing_id = l.id
            AND review.active_used_unit_count > 1
        )
          THEN 'Legacy used inventory had multiple units without item-level condition photos. Checkout was disabled until the seller assigns one photo per used pair.'
        WHEN EXISTS (
          SELECT 1
          FROM review_required_listings AS review
          WHERE review.listing_id = l.id
            AND review.image_count = 0
        )
          THEN 'Legacy used inventory was missing a listing-level condition photo. Checkout was disabled until the seller uploads one photo per used pair.'
        ELSE 'Legacy used inventory could not be safely mapped to item-level condition photos. Checkout was disabled until the seller reviews the listing and assigns one photo per used pair.'
      END
    ELSE NULL
  END,
  status = CASE
    WHEN EXISTS (
      SELECT 1
      FROM review_required_listings AS review
      WHERE review.listing_id = l.id
        AND review.active_new_variant_count = 0
        AND review.active_used_item_count = 0
    )
      THEN 'inactive'
    ELSE l.status
  END,
  condition = CASE
    WHEN EXISTS (
      SELECT 1
      FROM review_required_listings AS review
      WHERE review.listing_id = l.id
        AND review.active_new_variant_count > 0
        AND review.active_used_item_count = 0
    )
      THEN 'new'
    ELSE l.condition
  END
WHERE EXISTS (
  SELECT 1
  FROM safe_single_pair_candidates AS safe
  WHERE safe.listing_id = l.id
) OR EXISTS (
  SELECT 1
  FROM review_required_listings AS review
  WHERE review.listing_id = l.id
);
