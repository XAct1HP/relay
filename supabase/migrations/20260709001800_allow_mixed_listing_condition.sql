ALTER TABLE public.listings
  DROP CONSTRAINT IF EXISTS listings_condition_check;

ALTER TABLE public.listings
  ADD CONSTRAINT listings_condition_check
  CHECK (condition IN ('new', 'like_new', 'used_excellent', 'used_good', 'used_fair', 'mixed'));
