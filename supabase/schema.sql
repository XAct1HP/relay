-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- PROFILES TABLE
-- ============================================================================
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT,
  username TEXT UNIQUE NOT NULL,
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'buyer' CHECK (role IN ('buyer', 'seller', 'admin')),
  is_verified_seller BOOLEAN DEFAULT false,
  seller_application_status TEXT NOT NULL DEFAULT 'none'
    CHECK (seller_application_status IN ('none', 'pending', 'approved', 'rejected', 'rejected_final')),
  customer_messaging_enabled BOOLEAN NOT NULL DEFAULT false,
  vacation_mode_enabled BOOLEAN NOT NULL DEFAULT false,
  offers_enabled BOOLEAN NOT NULL DEFAULT false,
  stripe_account_id TEXT,
  ship_from_address JSONB,
  profile_banner_url TEXT,
  display_name TEXT,
  shop_name TEXT,
  profile_theme TEXT DEFAULT 'default',
  bio TEXT,
  followers_count INT DEFAULT 0,
  sales_count INT DEFAULT 0,
  avg_rating NUMERIC(3,2) DEFAULT 0,
  instagram_url TEXT,
  is_banned BOOLEAN DEFAULT false,
  ban_reason TEXT,
  dispute_flags_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for username lookups
CREATE INDEX idx_profiles_username ON profiles(username);
CREATE INDEX idx_profiles_email ON profiles(email);
CREATE INDEX idx_profiles_role ON profiles(role);

-- ============================================================================
-- SELLER_API_KEYS TABLE
-- ============================================================================
CREATE TABLE seller_api_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  seller_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL UNIQUE,
  key_prefix TEXT NOT NULL,
  name TEXT NOT NULL,
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_seller_api_keys_seller_id ON seller_api_keys(seller_id);
CREATE INDEX idx_seller_api_keys_seller_id_revoked_at ON seller_api_keys(seller_id, revoked_at);
CREATE INDEX idx_seller_api_keys_key_prefix ON seller_api_keys(key_prefix);

-- ============================================================================
-- INTEGRATION_API_LOGS TABLE
-- ============================================================================
CREATE TABLE integration_api_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  seller_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  api_key_id UUID REFERENCES seller_api_keys(id) ON DELETE SET NULL,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  status_code INT NOT NULL,
  request_id TEXT NOT NULL,
  error_code TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_integration_api_logs_created_at ON integration_api_logs(created_at DESC);
CREATE INDEX idx_integration_api_logs_seller_id_created_at ON integration_api_logs(seller_id, created_at DESC);
CREATE INDEX idx_integration_api_logs_api_key_id_created_at ON integration_api_logs(api_key_id, created_at DESC);
CREATE INDEX idx_integration_api_logs_request_id ON integration_api_logs(request_id);

-- ============================================================================
-- CATALOG_PRODUCTS TABLE
-- ============================================================================
CREATE TABLE catalog_products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sku TEXT NOT NULL UNIQUE,
  sku_normalized TEXT NOT NULL UNIQUE,
  brand TEXT NOT NULL,
  model TEXT NOT NULL,
  nickname TEXT,
  description TEXT,
  images TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_catalog_products_sku_normalized ON catalog_products(sku_normalized);

-- ============================================================================
-- LISTINGS TABLE
-- ============================================================================
CREATE TABLE listings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  seller_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  catalog_product_id UUID REFERENCES catalog_products(id) ON DELETE SET NULL,
  listing_type TEXT NOT NULL DEFAULT 'manual'
    CHECK (listing_type IN ('manual', 'sku')),
  sku TEXT,
  sku_normalized TEXT,
  brand TEXT NOT NULL,
  model TEXT NOT NULL,
  nickname TEXT,
  condition TEXT NOT NULL CHECK (condition IN ('new', 'like_new', 'used_excellent', 'used_good', 'used_fair')),
  box_condition TEXT NOT NULL CHECK (box_condition IN ('perfect', 'good', 'damaged', 'no_box')),
  approx_sizing TEXT NOT NULL CHECK (approx_sizing IN ('lightweight', 'normal', 'heavy')),
  description TEXT,
  images TEXT[],
  sizes JSONB NOT NULL, -- Array of {size, price, quantity}
  admin_review_status TEXT DEFAULT NULL
    CHECK (admin_review_status IN ('pending_review', 'approved', 'rejected')),
  admin_review_notes TEXT DEFAULT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'sold_out', 'inactive', 'removed', 'pending_review', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for frequently queried columns
CREATE INDEX idx_listings_seller_id ON listings(seller_id);
CREATE INDEX idx_listings_status ON listings(status);
CREATE INDEX idx_listings_created_at ON listings(created_at);
CREATE INDEX idx_listings_seller_updated_at ON listings(seller_id, updated_at DESC);
CREATE INDEX idx_listings_brand ON listings(brand);
CREATE INDEX idx_listings_catalog_product_id ON listings(catalog_product_id);
CREATE UNIQUE INDEX idx_listings_unique_seller_sku
  ON listings(seller_id, sku_normalized)
  WHERE sku_normalized IS NOT NULL
    AND status <> 'removed';

-- ============================================================================
-- LISTING_VARIANTS TABLE
-- ============================================================================
CREATE TABLE listing_variants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  size TEXT NOT NULL,
  price NUMERIC(10, 2) NOT NULL CHECK (price > 0),
  quantity INT NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(listing_id, size)
);

CREATE INDEX idx_listing_variants_listing_id ON listing_variants(listing_id);
CREATE INDEX idx_listing_variants_active ON listing_variants(listing_id, is_active);

-- ============================================================================
-- LISTING_USED_ITEMS TABLE
-- ============================================================================
CREATE TABLE listing_used_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
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

CREATE UNIQUE INDEX idx_listing_used_items_listing_photo_unique
  ON listing_used_items(listing_id, condition_photo_url);
CREATE INDEX idx_listing_used_items_listing_id ON listing_used_items(listing_id);
CREATE INDEX idx_listing_used_items_active ON listing_used_items(listing_id, is_active);

-- ============================================================================
-- FOLLOWS TABLE
-- ============================================================================
CREATE TABLE follows (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  follower_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(follower_id, following_id)
);

-- Create indexes
CREATE INDEX idx_follows_follower_id ON follows(follower_id);
CREATE INDEX idx_follows_following_id ON follows(following_id);

-- ============================================================================
-- POSTS TABLE
-- ============================================================================
CREATE TABLE posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  seller_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  images TEXT[],
  likes_count INT DEFAULT 0,
  is_rising_brand BOOLEAN DEFAULT false,
  related_listing_id UUID REFERENCES listings(id) ON DELETE SET NULL,
  is_custom_brand BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for frequently queried columns
CREATE INDEX idx_posts_seller_id ON posts(seller_id);
CREATE INDEX idx_posts_created_at ON posts(created_at);
CREATE INDEX idx_posts_is_rising_brand ON posts(is_rising_brand);
CREATE INDEX idx_posts_related_listing_id ON posts(related_listing_id);
CREATE INDEX idx_posts_is_custom_brand ON posts(is_custom_brand);

-- ============================================================================
-- POST_LIKES TABLE
-- ============================================================================
CREATE TABLE post_likes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(post_id, user_id)
);

-- Create indexes
CREATE INDEX idx_post_likes_post_id ON post_likes(post_id);
CREATE INDEX idx_post_likes_user_id ON post_likes(user_id);

-- ============================================================================
-- CONVERSATIONS TABLE
-- ============================================================================
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  participant_ids UUID[] NOT NULL,
  listing_id UUID REFERENCES listings(id) ON DELETE SET NULL,
  last_message TEXT,
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_conversations_participant_ids ON conversations USING GIN(participant_ids);
CREATE INDEX idx_conversations_listing_id ON conversations(listing_id);
CREATE INDEX idx_conversations_created_at ON conversations(created_at);

-- ============================================================================
-- MESSAGES TABLE
-- ============================================================================
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT,
  message_type TEXT NOT NULL DEFAULT 'text'
    CHECK (message_type IN ('text', 'custom_offer', 'offer_accepted', 'offer_declined', 'system')),
  custom_offer_price NUMERIC(10, 2),
  custom_offer_status TEXT CHECK (custom_offer_status IN ('pending', 'accepted', 'declined')),
  custom_offer_size TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_messages_sender_id ON messages(sender_id);
CREATE INDEX idx_messages_created_at ON messages(created_at);

-- ============================================================================
-- CUSTOM_OFFERS TABLE
-- ============================================================================
CREATE TABLE custom_offers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  listing_variant_id UUID REFERENCES listing_variants(id) ON DELETE SET NULL,
  listing_used_item_id UUID REFERENCES listing_used_items(id) ON DELETE SET NULL,
  size TEXT NOT NULL,
  original_price NUMERIC(10, 2) NOT NULL,
  offer_price NUMERIC(10, 2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined', 'expired')),
  CHECK (num_nonnulls(listing_variant_id, listing_used_item_id) <= 1),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

-- Create indexes
CREATE INDEX idx_custom_offers_conversation_id ON custom_offers(conversation_id);
CREATE INDEX idx_custom_offers_sender_id ON custom_offers(sender_id);
CREATE INDEX idx_custom_offers_listing_id ON custom_offers(listing_id);
CREATE INDEX idx_custom_offers_listing_variant_id ON custom_offers(listing_variant_id);
CREATE INDEX idx_custom_offers_listing_used_item_id ON custom_offers(listing_used_item_id);
CREATE INDEX idx_custom_offers_status ON custom_offers(status);

-- ============================================================================
-- ORDERS TABLE
-- ============================================================================
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE RESTRICT,
  listing_variant_id UUID REFERENCES listing_variants(id) ON DELETE SET NULL,
  listing_used_item_id UUID REFERENCES listing_used_items(id) ON DELETE SET NULL,
  buyer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  seller_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  custom_offer_id UUID REFERENCES custom_offers(id) ON DELETE SET NULL,
  size TEXT NOT NULL,
  price NUMERIC(10, 2) NOT NULL,
  shipping_cost NUMERIC(10, 2) NOT NULL,
  shipping_buffer NUMERIC(10, 2) DEFAULT 1.50,
  platform_fee NUMERIC(10, 2),
  stripe_fee NUMERIC(10, 2),
  seller_earnings NUMERIC(10, 2),
  status TEXT NOT NULL DEFAULT 'pending_payment'
    CHECK (status IN (
      'pending_payment', 'paid', 'auth_submitted', 'label_created', 'shipped',
      'delivered', 'review_window', 'completed', 'disputed', 'cancelled',
      'refund_pending', 'refunded', 'payout_failed',
      'return_pending', 'return_shipped', 'return_delivered'
    )),
  stripe_payment_intent_id TEXT,
  stripe_transfer_id TEXT,
  shipping_label_url TEXT,
  tracking_number TEXT,
  tracking_status TEXT,
  auth_photos TEXT[],
  checkcheck_certificate_url TEXT,
  purchased_condition_photo_url TEXT,
  challenge_code TEXT,
  buyer_shipping_address JSONB,
  dispute_reason TEXT,
  dispute_evidence_buyer TEXT[],
  dispute_evidence_seller TEXT[],
  dispute_ruling TEXT,
  dispute_text_buyer TEXT,
  dispute_text_seller TEXT,
  review_rating INT CHECK (review_rating IS NULL OR (review_rating >= 1 AND review_rating <= 5)),
  review_comment TEXT,
  shipping_deadline TIMESTAMPTZ,
  review_deadline TIMESTAMPTZ,
  shipped_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  admin_notes TEXT,
  return_label_url TEXT,
  return_tracking_number TEXT,
  return_packing_slip_id TEXT,
  return_status TEXT CHECK (return_status IS NULL OR return_status IN ('pending', 'shipped', 'delivered')),
  return_created_at TIMESTAMPTZ,
  return_delivered_at TIMESTAMPTZ,
  CHECK (num_nonnulls(listing_variant_id, listing_used_item_id) <= 1),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for frequently queried columns
CREATE INDEX idx_orders_listing_id ON orders(listing_id);
CREATE INDEX idx_orders_listing_variant_id ON orders(listing_variant_id);
CREATE INDEX idx_orders_listing_used_item_id ON orders(listing_used_item_id);
CREATE INDEX idx_orders_buyer_id ON orders(buyer_id);
CREATE INDEX idx_orders_seller_id ON orders(seller_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created_at ON orders(created_at);
CREATE INDEX idx_orders_custom_offer_id ON orders(custom_offer_id);

-- ============================================================================
-- SELLER_APPLICATIONS TABLE
-- ============================================================================
CREATE TABLE seller_applications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  ship_from_address JSONB,
  questionnaire_responses JSONB,
  stripe_connected BOOLEAN DEFAULT false,
  terms_accepted BOOLEAN DEFAULT false,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_notes TEXT,
  ai_recommendation TEXT,
  rejection_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_seller_applications_user_id ON seller_applications(user_id);
CREATE INDEX idx_seller_applications_status ON seller_applications(status);
CREATE INDEX idx_seller_applications_created_at ON seller_applications(created_at);

-- ============================================================================
-- REVIEWS TABLE
-- ============================================================================
CREATE TABLE reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  seller_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_reviews_order_id ON reviews(order_id);
CREATE INDEX idx_reviews_reviewer_id ON reviews(reviewer_id);
CREATE INDEX idx_reviews_seller_id ON reviews(seller_id);

-- ============================================================================
-- FUNCTIONS AND TRIGGERS
-- ============================================================================

-- IMPORTANT: To disable email verification for development:
-- Go to Supabase Dashboard > Authentication > Providers > Email
-- Toggle OFF "Confirm email" / "Enable email confirmations"
-- This allows users to sign in immediately after signup without email verification.

-- Function to generate a random unique username (e.g. "user_a7x9k2m")
CREATE OR REPLACE FUNCTION public.generate_random_username()
RETURNS TEXT AS $$
DECLARE
  new_username TEXT;
  chars TEXT := 'abcdefghijklmnopqrstuvwxyz0123456789';
  i INT;
BEGIN
  LOOP
    new_username := 'user_';
    FOR i IN 1..7 LOOP
      new_username := new_username || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;
    -- Ensure uniqueness
    EXIT WHEN NOT EXISTS (SELECT 1 FROM profiles WHERE username = new_username);
  END LOOP;
  RETURN new_username;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.normalize_listing_sku(raw_sku TEXT)
RETURNS TEXT AS $$
DECLARE
  cleaned TEXT;
BEGIN
  IF raw_sku IS NULL THEN
    RETURN NULL;
  END IF;

  cleaned := regexp_replace(upper(trim(raw_sku)), '[^A-Z0-9]', '', 'g');

  IF cleaned = '' THEN
    RETURN NULL;
  END IF;

  RETURN cleaned;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to automatically create a profile when a new auth user is created
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, username, role)
  VALUES (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    public.generate_random_username(),
    COALESCE(new.raw_user_meta_data ->> 'role', 'buyer')
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger to create profile on user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.prepare_listing_identity()
RETURNS TRIGGER AS $$
BEGIN
  NEW.sku_normalized := public.normalize_listing_sku(NEW.sku);

  IF NEW.sku_normalized IS NULL THEN
    NEW.listing_type := 'manual';
  ELSE
    NEW.listing_type := 'sku';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at columns
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_catalog_products_updated_at
  BEFORE UPDATE ON catalog_products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_listings_updated_at
  BEFORE UPDATE ON listings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER prepare_listing_identity_before_write
  BEFORE INSERT OR UPDATE OF sku, listing_type ON listings
  FOR EACH ROW EXECUTE FUNCTION public.prepare_listing_identity();

CREATE TRIGGER update_listing_variants_updated_at
  BEFORE UPDATE ON listing_variants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_listing_used_items_updated_at
  BEFORE UPDATE ON listing_used_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_seller_applications_updated_at
  BEFORE UPDATE ON seller_applications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

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
          'quantity', quantity
        )
        ORDER BY size
      ) FILTER (WHERE is_active = true),
      '[]'::jsonb
    ),
    COUNT(*) FILTER (WHERE is_active = true AND quantity > 0)
  INTO aggregated_sizes, available_variant_count
  FROM listing_variants
  WHERE listing_id = target_listing_id;

  UPDATE listings
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

CREATE OR REPLACE FUNCTION public.on_listing_variant_changed()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM public.sync_listing_from_variants(COALESCE(NEW.listing_id, OLD.listing_id));
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER listing_variants_sync_after_insert
  AFTER INSERT ON listing_variants
  FOR EACH ROW EXECUTE FUNCTION public.on_listing_variant_changed();

CREATE TRIGGER listing_variants_sync_after_update
  AFTER UPDATE ON listing_variants
  FOR EACH ROW EXECUTE FUNCTION public.on_listing_variant_changed();

CREATE TRIGGER listing_variants_sync_after_delete
  AFTER DELETE ON listing_variants
  FOR EACH ROW EXECUTE FUNCTION public.on_listing_variant_changed();

-- Function to increment post likes count
CREATE OR REPLACE FUNCTION public.increment_post_likes(post_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE posts
  SET likes_count = likes_count + 1
  WHERE id = post_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Function to decrement post likes count (SECURITY DEFINER to bypass RLS)
CREATE OR REPLACE FUNCTION public.decrement_post_likes(post_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE posts
  SET likes_count = GREATEST(likes_count - 1, 0)
  WHERE id = post_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger to update likes count when a like is added
CREATE OR REPLACE FUNCTION public.on_post_like_inserted()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM public.increment_post_likes(NEW.post_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger to update likes count when a like is deleted
CREATE OR REPLACE FUNCTION public.on_post_like_deleted()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM public.decrement_post_likes(OLD.post_id);
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER post_likes_increment
  AFTER INSERT ON post_likes
  FOR EACH ROW EXECUTE FUNCTION public.on_post_like_inserted();

CREATE TRIGGER post_likes_decrement
  AFTER DELETE ON post_likes
  FOR EACH ROW EXECUTE FUNCTION public.on_post_like_deleted();

-- Triggers for follower count on follows table
CREATE OR REPLACE FUNCTION public.on_follow_inserted()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE profiles SET followers_count = followers_count + 1 WHERE id = NEW.following_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.on_follow_deleted()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE profiles SET followers_count = GREATEST(followers_count - 1, 0) WHERE id = OLD.following_id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER follows_increment
  AFTER INSERT ON follows
  FOR EACH ROW EXECUTE FUNCTION public.on_follow_inserted();

CREATE TRIGGER follows_decrement
  AFTER DELETE ON follows
  FOR EACH ROW EXECUTE FUNCTION public.on_follow_deleted();

-- Triggers for seller stats on reviews table
CREATE OR REPLACE FUNCTION public.on_review_inserted()
RETURNS TRIGGER AS $$
DECLARE
  current_sales INT;
  current_avg NUMERIC;
  new_avg NUMERIC;
BEGIN
  SELECT COALESCE(sales_count, 0), COALESCE(avg_rating, 0)
    INTO current_sales, current_avg
    FROM profiles WHERE id = NEW.seller_id;

  current_sales := current_sales + 1;
  new_avg := (current_avg * (current_sales - 1) + NEW.rating) / current_sales;

  UPDATE profiles
    SET sales_count = current_sales,
        avg_rating = ROUND(new_avg, 2)
    WHERE id = NEW.seller_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER reviews_update_seller_stats
  AFTER INSERT ON reviews
  FOR EACH ROW EXECUTE FUNCTION public.on_review_inserted();

-- Function to check if username is available
CREATE OR REPLACE FUNCTION public.is_username_available(username_check TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN NOT EXISTS (
    SELECT 1 FROM profiles WHERE LOWER(username) = LOWER(username_check)
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE seller_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_api_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE listing_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE listing_used_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE seller_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PROFILES POLICIES
-- ============================================================================

-- Anyone can read profiles (public profile information)
CREATE POLICY "Profiles are viewable by everyone" ON profiles
  FOR SELECT USING (true);

-- Users can update their own profile
CREATE POLICY "Users can update their own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- Users can insert their own profile (via trigger, but we allow it for safety)
CREATE POLICY "Users can insert their own profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Admins can read integration logs
CREATE POLICY "Admins can read integration api logs" ON integration_api_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Only admins can delete profiles
CREATE POLICY "Only admins can delete profiles" ON profiles
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================================================
-- CATALOG_PRODUCTS POLICIES
-- ============================================================================

CREATE POLICY "Everyone can read catalog products" ON catalog_products
  FOR SELECT USING (true);

-- ============================================================================
-- LISTINGS POLICIES
-- ============================================================================

-- Anyone can read active listings; sellers see their own; admins see all (for reviews)
CREATE POLICY "Everyone can read active listings" ON listings
  FOR SELECT USING (
    status = 'active'
    OR seller_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
    OR EXISTS (
      SELECT 1 FROM orders
      WHERE orders.listing_id = listings.id
      AND (orders.buyer_id = auth.uid() OR orders.seller_id = auth.uid())
    )
  );

-- Sellers can insert their own listings
CREATE POLICY "Sellers can insert their own listings" ON listings
  FOR INSERT WITH CHECK (
    auth.uid() = seller_id AND
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND
        (role = 'seller' OR role = 'admin')
    )
  );

-- Sellers can update their own listings; admins can update any listing (for approvals)
CREATE POLICY "Sellers can update their own listings" ON listings
  FOR UPDATE USING (
    auth.uid() = seller_id
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Sellers can delete their own listings
CREATE POLICY "Sellers can delete their own listings" ON listings
  FOR DELETE USING (auth.uid() = seller_id);

CREATE POLICY "Everyone can read listing variants" ON listing_variants
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM listings
      WHERE listings.id = listing_variants.listing_id
        AND (
          listings.status = 'active'
          OR listings.seller_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
          )
          OR EXISTS (
            SELECT 1 FROM orders
            WHERE orders.listing_id = listings.id
              AND (orders.buyer_id = auth.uid() OR orders.seller_id = auth.uid())
          )
        )
    )
  );

CREATE POLICY "Sellers can insert listing variants" ON listing_variants
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1
      FROM listings
      WHERE listings.id = listing_variants.listing_id
        AND (
          listings.seller_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
          )
        )
    )
  );

CREATE POLICY "Sellers can update listing variants" ON listing_variants
  FOR UPDATE USING (
    EXISTS (
      SELECT 1
      FROM listings
      WHERE listings.id = listing_variants.listing_id
        AND (
          listings.seller_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
          )
        )
    )
  );

CREATE POLICY "Sellers can delete listing variants" ON listing_variants
  FOR DELETE USING (
    EXISTS (
      SELECT 1
      FROM listings
      WHERE listings.id = listing_variants.listing_id
        AND (
          listings.seller_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
          )
        )
    )
  );

CREATE POLICY "Everyone can read listing used items" ON listing_used_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM listings
      WHERE listings.id = listing_used_items.listing_id
        AND (
          listings.status = 'active'
          OR listings.seller_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
          )
          OR EXISTS (
            SELECT 1 FROM orders
            WHERE orders.listing_id = listing_used_items.listing_id
              AND (orders.buyer_id = auth.uid() OR orders.seller_id = auth.uid())
          )
        )
    )
  );

CREATE POLICY "Sellers can insert listing used items" ON listing_used_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1
      FROM listings
      WHERE listings.id = listing_used_items.listing_id
        AND (
          listings.seller_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
          )
        )
    )
  );

CREATE POLICY "Sellers can update listing used items" ON listing_used_items
  FOR UPDATE USING (
    EXISTS (
      SELECT 1
      FROM listings
      WHERE listings.id = listing_used_items.listing_id
        AND (
          listings.seller_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
          )
        )
    )
  );

CREATE POLICY "Sellers can delete listing used items" ON listing_used_items
  FOR DELETE USING (
    EXISTS (
      SELECT 1
      FROM listings
      WHERE listings.id = listing_used_items.listing_id
        AND (
          listings.seller_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
          )
        )
    )
  );

-- ============================================================================
-- FOLLOWS POLICIES
-- ============================================================================

-- Anyone can read follows
CREATE POLICY "Everyone can read follows" ON follows
  FOR SELECT USING (true);

-- Users can follow others
CREATE POLICY "Users can insert follows" ON follows
  FOR INSERT WITH CHECK (auth.uid() = follower_id);

-- Users can unfollow
CREATE POLICY "Users can delete their own follows" ON follows
  FOR DELETE USING (auth.uid() = follower_id);

-- ============================================================================
-- POSTS POLICIES
-- ============================================================================

-- Anyone can read posts
CREATE POLICY "Everyone can read posts" ON posts
  FOR SELECT USING (true);

-- Sellers can insert their own posts
CREATE POLICY "Sellers can insert their own posts" ON posts
  FOR INSERT WITH CHECK (
    auth.uid() = seller_id AND
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND
        (role = 'seller' OR role = 'admin')
    )
  );

-- Sellers can update their own posts
CREATE POLICY "Sellers can update their own posts" ON posts
  FOR UPDATE USING (auth.uid() = seller_id);

-- Sellers can delete their own posts
CREATE POLICY "Sellers can delete their own posts" ON posts
  FOR DELETE USING (auth.uid() = seller_id);

-- ============================================================================
-- POST_LIKES POLICIES
-- ============================================================================

-- Anyone can read post likes
CREATE POLICY "Everyone can read post likes" ON post_likes
  FOR SELECT USING (true);

-- Users can like posts
CREATE POLICY "Users can insert likes" ON post_likes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can remove their own likes
CREATE POLICY "Users can delete their own likes" ON post_likes
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================================
-- CONVERSATIONS POLICIES
-- ============================================================================

-- Users can read conversations they're part of
CREATE POLICY "Users can read conversations they're in" ON conversations
  FOR SELECT USING (
    auth.uid() = ANY(participant_ids) OR
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Users can insert conversations
CREATE POLICY "Users can insert conversations" ON conversations
  FOR INSERT WITH CHECK (
    auth.uid() = ANY(participant_ids)
    AND NOT EXISTS (
      SELECT 1
      FROM profiles AS sender_profile
      JOIN profiles AS recipient_profile
        ON recipient_profile.id = ANY(participant_ids)
      WHERE sender_profile.id = auth.uid()
        AND recipient_profile.id <> auth.uid()
        AND sender_profile.role = 'buyer'
        AND recipient_profile.role IN ('seller', 'admin')
        AND (
          recipient_profile.customer_messaging_enabled = false
          OR recipient_profile.vacation_mode_enabled = true
        )
    )
  );

-- Users can update conversations they're part of
CREATE POLICY "Users can update conversations they're in" ON conversations
  FOR UPDATE USING (
    auth.uid() = ANY(participant_ids) OR
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================================================
-- MESSAGES POLICIES
-- ============================================================================

-- Users can read messages from conversations they're part of
CREATE POLICY "Users can read messages from their conversations" ON messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM conversations
      WHERE id = messages.conversation_id AND
        (auth.uid() = ANY(participant_ids) OR
         EXISTS (
           SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
         ))
    )
  );

-- Users can insert messages to conversations they're part of
CREATE POLICY "Users can insert messages to their conversations" ON messages
  FOR INSERT WITH CHECK (
    auth.uid() = sender_id AND
    EXISTS (
      SELECT 1 FROM conversations
      WHERE id = conversation_id AND auth.uid() = ANY(participant_ids)
    )
    AND (
      message_type <> 'custom_offer'
      OR EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
          AND (role = 'admin' OR offers_enabled = true)
      )
    )
    AND NOT EXISTS (
      SELECT 1
      FROM conversations
      JOIN profiles AS sender_profile ON sender_profile.id = auth.uid()
      JOIN profiles AS recipient_profile
        ON recipient_profile.id = ANY(conversations.participant_ids)
      WHERE conversations.id = conversation_id
        AND recipient_profile.id <> auth.uid()
        AND sender_profile.role = 'buyer'
        AND recipient_profile.role IN ('seller', 'admin')
        AND (
          recipient_profile.customer_messaging_enabled = false
          OR recipient_profile.vacation_mode_enabled = true
        )
    )
  );

-- ============================================================================
-- CUSTOM_OFFERS POLICIES
-- ============================================================================

-- Users can read custom offers from their conversations
CREATE POLICY "Users can read custom offers from their conversations" ON custom_offers
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM conversations
      WHERE id = custom_offers.conversation_id AND
        auth.uid() = ANY(participant_ids)
    )
  );

-- Users can insert custom offers to conversations they're part of
CREATE POLICY "Users can insert custom offers to their conversations" ON custom_offers
  FOR INSERT WITH CHECK (
    auth.uid() = sender_id AND
    EXISTS (
      SELECT 1 FROM conversations
      WHERE id = conversation_id AND auth.uid() = ANY(participant_ids)
    )
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND (role = 'admin' OR offers_enabled = true)
    )
  );

-- Users can update their own custom offers
CREATE POLICY "Users can update their own custom offers" ON custom_offers
  FOR UPDATE USING (auth.uid() = sender_id);

-- ============================================================================
-- ORDERS POLICIES
-- ============================================================================

-- Buyers and sellers can read their own orders
CREATE POLICY "Users can read their own orders" ON orders
  FOR SELECT USING (
    auth.uid() = buyer_id OR
    auth.uid() = seller_id OR
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Users can insert orders (buying)
CREATE POLICY "Buyers can create orders" ON orders
  FOR INSERT WITH CHECK (auth.uid() = buyer_id);

-- Buyers and sellers can update orders
CREATE POLICY "Users can update their orders" ON orders
  FOR UPDATE USING (
    auth.uid() = buyer_id OR
    auth.uid() = seller_id OR
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================================================
-- SELLER_APPLICATIONS POLICIES
-- ============================================================================

-- Users can read their own applications
CREATE POLICY "Users can read their own applications" ON seller_applications
  FOR SELECT USING (
    auth.uid() = user_id OR
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Users can insert applications
CREATE POLICY "Users can create applications" ON seller_applications
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own applications
CREATE POLICY "Users can update their own applications" ON seller_applications
  FOR UPDATE USING (
    auth.uid() = user_id OR
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Only admins can delete applications
CREATE POLICY "Only admins can delete applications" ON seller_applications
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================================================
-- REVIEWS POLICIES
-- ============================================================================

-- Anyone can read reviews
CREATE POLICY "Everyone can read reviews" ON reviews
  FOR SELECT USING (true);

-- Users can insert reviews for orders they participated in
CREATE POLICY "Users can insert reviews for their orders" ON reviews
  FOR INSERT WITH CHECK (
    auth.uid() = reviewer_id AND
    EXISTS (
      SELECT 1 FROM orders
      WHERE id = order_id AND
        (auth.uid() = buyer_id OR auth.uid() = seller_id)
    )
  );

-- Users can update their own reviews
CREATE POLICY "Users can update their own reviews" ON reviews
  FOR UPDATE USING (auth.uid() = reviewer_id);

-- Users can delete their own reviews
CREATE POLICY "Users can delete their own reviews" ON reviews
  FOR DELETE USING (auth.uid() = reviewer_id);
