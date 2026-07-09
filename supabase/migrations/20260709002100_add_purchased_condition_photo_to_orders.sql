ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS purchased_condition_photo_url TEXT;
