-- Fix: Allow buyers and sellers to view listing details for their own orders,
-- even when the listing is no longer active (e.g., sold out, inactive).
--
-- Previously, the policy only allowed reading listings that were 'active' or
-- owned by the current user. This meant buyers viewing their order details
-- would see "Unknown Unknown" if the listing status had changed.

-- Drop the old restrictive policy
DROP POLICY IF EXISTS "Everyone can read active listings" ON listings;

-- Create updated policy that also allows order participants to view the listing
CREATE POLICY "Everyone can read active listings" ON listings
  FOR SELECT USING (
    status = 'active'
    OR seller_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM orders
      WHERE orders.listing_id = listings.id
      AND (orders.buyer_id = auth.uid() OR orders.seller_id = auth.uid())
    )
  );
