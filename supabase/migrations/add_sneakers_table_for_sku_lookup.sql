CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.sneakers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT NOT NULL,
  normalized_sku TEXT NOT NULL,
  brand TEXT,
  name TEXT NOT NULL,
  model TEXT,
  nickname TEXT,
  colorway TEXT,
  gender TEXT,
  release_date DATE,
  retail_price NUMERIC,
  image_url TEXT,
  source TEXT DEFAULT 'kicksdb',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sneakers_sku
  ON public.sneakers(sku);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sneakers_normalized_sku
  ON public.sneakers(normalized_sku);

CREATE INDEX IF NOT EXISTS idx_sneakers_name
  ON public.sneakers(name);

ALTER TABLE public.sneakers ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'sneakers'
      AND policyname = 'Everyone can read sneakers'
  ) THEN
    CREATE POLICY "Everyone can read sneakers" ON public.sneakers
      FOR SELECT USING (true);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'update_sneakers_updated_at'
      AND tgrelid = 'public.sneakers'::regclass
  ) THEN
    CREATE TRIGGER update_sneakers_updated_at
      BEFORE UPDATE ON public.sneakers
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END
$$;

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS sku TEXT,
  ADD COLUMN IF NOT EXISTS sneaker_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'listings_sneaker_id_fkey'
      AND conrelid = 'public.listings'::regclass
  ) THEN
    ALTER TABLE public.listings
      ADD CONSTRAINT listings_sneaker_id_fkey
      FOREIGN KEY (sneaker_id)
      REFERENCES public.sneakers(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_listings_sneaker_id
  ON public.listings(sneaker_id);
