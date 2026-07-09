ALTER TABLE public.sneakers
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS gallery_images TEXT[] DEFAULT '{}'::TEXT[];
