CREATE OR REPLACE FUNCTION public.decrement_listing_variant_inventory(target_listing_variant_id UUID)
RETURNS TABLE (
  variant_id UUID,
  listing_id UUID,
  quantity INT,
  is_active BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  UPDATE listing_variants
  SET
    quantity = GREATEST(listing_variants.quantity - 1, 0),
    is_active = CASE
      WHEN listing_variants.quantity - 1 <= 0 THEN false
      ELSE listing_variants.is_active
    END
  WHERE listing_variants.id = target_listing_variant_id
    AND listing_variants.is_active = true
    AND listing_variants.quantity > 0
  RETURNING
    listing_variants.id,
    listing_variants.listing_id,
    listing_variants.quantity,
    listing_variants.is_active;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
