


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."decrement_listing_variant_inventory"("target_listing_variant_id" "uuid") RETURNS TABLE("variant_id" "uuid", "listing_id" "uuid", "quantity" integer, "is_active" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."decrement_listing_variant_inventory"("target_listing_variant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."decrement_post_likes"("post_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE posts SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = post_id;
END;
$$;


ALTER FUNCTION "public"."decrement_post_likes"("post_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_random_username"() RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
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
    EXIT WHEN NOT EXISTS (SELECT 1 FROM profiles WHERE username = new_username);
  END LOOP;
  RETURN new_username;
END;
$$;


ALTER FUNCTION "public"."generate_random_username"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_post_likes"("post_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE posts SET likes_count = likes_count + 1 WHERE id = post_id;
END;
$$;


ALTER FUNCTION "public"."increment_post_likes"("post_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_username_available"("username_check" "text") RETURNS boolean
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RETURN NOT EXISTS (
    SELECT 1 FROM profiles WHERE LOWER(username) = LOWER(username_check)
  );
END;
$$;


ALTER FUNCTION "public"."is_username_available"("username_check" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."normalize_listing_sku"("raw_sku" "text") RETURNS "text"
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
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
$$;


ALTER FUNCTION "public"."normalize_listing_sku"("raw_sku" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."on_follow_deleted"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE profiles SET followers_count = GREATEST(followers_count - 1, 0) WHERE id = OLD.following_id;
  RETURN OLD;
END;
$$;


ALTER FUNCTION "public"."on_follow_deleted"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."on_follow_inserted"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE profiles SET followers_count = followers_count + 1 WHERE id = NEW.following_id;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."on_follow_inserted"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."on_listing_variant_changed"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  PERFORM public.sync_listing_from_variants(COALESCE(NEW.listing_id, OLD.listing_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."on_listing_variant_changed"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."on_post_like_deleted"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  PERFORM public.decrement_post_likes(OLD.post_id);
  RETURN OLD;
END;
$$;


ALTER FUNCTION "public"."on_post_like_deleted"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."on_post_like_inserted"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  PERFORM public.increment_post_likes(NEW.post_id);
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."on_post_like_inserted"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."on_review_inserted"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
    SET sales_count = current_sales, avg_rating = ROUND(new_avg, 2)
    WHERE id = NEW.seller_id;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."on_review_inserted"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prepare_listing_identity"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.sku_normalized := public.normalize_listing_sku(NEW.sku);

  IF NEW.sku_normalized IS NULL THEN
    NEW.listing_type := 'manual';
  ELSE
    NEW.listing_type := 'sku';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."prepare_listing_identity"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_listing_from_variants"("target_listing_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."sync_listing_from_variants"("target_listing_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."catalog_products" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "sku" "text" NOT NULL,
    "sku_normalized" "text" NOT NULL,
    "brand" "text" NOT NULL,
    "model" "text" NOT NULL,
    "nickname" "text",
    "description" "text",
    "images" "text"[] DEFAULT '{}'::"text"[],
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."catalog_products" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conversation_reads" (
    "user_id" "uuid" NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "last_read_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."conversation_reads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conversations" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "participant_ids" "uuid"[] NOT NULL,
    "listing_id" "uuid",
    "last_message" "text",
    "last_message_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."conversations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."custom_offers" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "listing_id" "uuid" NOT NULL,
    "size" "text" NOT NULL,
    "original_price" numeric(10,2) NOT NULL,
    "offer_price" numeric(10,2) NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "expires_at" timestamp with time zone NOT NULL,
    "listing_variant_id" "uuid",
    CONSTRAINT "custom_offers_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'declined'::"text", 'expired'::"text"])))
);


ALTER TABLE "public"."custom_offers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."follows" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "follower_id" "uuid" NOT NULL,
    "following_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."follows" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."listing_variants" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "listing_id" "uuid" NOT NULL,
    "size" "text" NOT NULL,
    "price" numeric(10,2) NOT NULL,
    "quantity" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "listing_variants_price_check" CHECK (("price" > (0)::numeric)),
    CONSTRAINT "listing_variants_quantity_check" CHECK (("quantity" >= 0))
);


ALTER TABLE "public"."listing_variants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."listings" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "seller_id" "uuid" NOT NULL,
    "brand" "text" NOT NULL,
    "model" "text" NOT NULL,
    "nickname" "text",
    "condition" "text" NOT NULL,
    "box_condition" "text" NOT NULL,
    "approx_sizing" "text" NOT NULL,
    "description" "text",
    "images" "text"[],
    "sizes" "jsonb" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "admin_review_status" "text",
    "admin_review_notes" "text",
    "listing_type" "text" DEFAULT 'manual'::"text" NOT NULL,
    "sku" "text",
    "sku_normalized" "text",
    "catalog_product_id" "uuid",
    CONSTRAINT "listings_admin_review_status_check" CHECK (("admin_review_status" = ANY (ARRAY['pending_review'::"text", 'approved'::"text", 'rejected'::"text"]))),
    CONSTRAINT "listings_approx_sizing_check" CHECK (("approx_sizing" = ANY (ARRAY['lightweight'::"text", 'normal'::"text", 'heavy'::"text"]))),
    CONSTRAINT "listings_box_condition_check" CHECK (("box_condition" = ANY (ARRAY['perfect'::"text", 'good'::"text", 'damaged'::"text", 'no_box'::"text"]))),
    CONSTRAINT "listings_condition_check" CHECK (("condition" = ANY (ARRAY['new'::"text", 'like_new'::"text", 'used_excellent'::"text", 'used_good'::"text", 'used_fair'::"text"]))),
    CONSTRAINT "listings_listing_type_check" CHECK (("listing_type" = ANY (ARRAY['manual'::"text", 'sku'::"text"]))),
    CONSTRAINT "listings_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'sold_out'::"text", 'inactive'::"text", 'removed'::"text", 'pending_review'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."listings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."messages" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "content" "text",
    "message_type" "text" DEFAULT 'text'::"text" NOT NULL,
    "custom_offer_price" numeric(10,2),
    "custom_offer_status" "text",
    "custom_offer_size" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "messages_custom_offer_status_check" CHECK (("custom_offer_status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'declined'::"text"]))),
    CONSTRAINT "messages_message_type_check" CHECK (("message_type" = ANY (ARRAY['text'::"text", 'custom_offer'::"text", 'offer_accepted'::"text", 'offer_declined'::"text", 'system'::"text"])))
);


ALTER TABLE "public"."messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."orders" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "listing_id" "uuid" NOT NULL,
    "buyer_id" "uuid" NOT NULL,
    "seller_id" "uuid" NOT NULL,
    "custom_offer_id" "uuid",
    "size" "text" NOT NULL,
    "price" numeric(10,2) NOT NULL,
    "shipping_cost" numeric(10,2) NOT NULL,
    "shipping_buffer" numeric(10,2) DEFAULT 1.50,
    "platform_fee" numeric(10,2),
    "stripe_fee" numeric(10,2),
    "seller_earnings" numeric(10,2),
    "status" "text" DEFAULT 'pending_payment'::"text" NOT NULL,
    "stripe_payment_intent_id" "text",
    "stripe_transfer_id" "text",
    "shipping_label_url" "text",
    "tracking_number" "text",
    "tracking_status" "text",
    "auth_photos" "text"[],
    "checkcheck_certificate_url" "text",
    "challenge_code" "text",
    "buyer_shipping_address" "jsonb",
    "dispute_reason" "text",
    "dispute_evidence_buyer" "text"[],
    "dispute_evidence_seller" "text"[],
    "dispute_ruling" "text",
    "dispute_text_buyer" "text",
    "dispute_text_seller" "text",
    "review_rating" integer,
    "review_comment" "text",
    "shipping_deadline" timestamp with time zone,
    "review_deadline" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "shipped_at" timestamp with time zone,
    "delivered_at" timestamp with time zone,
    "admin_notes" "text",
    "return_label_url" "text",
    "return_tracking_number" "text",
    "return_packing_slip_id" "text",
    "return_status" "text",
    "return_created_at" timestamp with time zone,
    "return_delivered_at" timestamp with time zone,
    "buyer_last_seen_at" timestamp with time zone,
    "seller_last_seen_at" timestamp with time zone,
    "listing_variant_id" "uuid",
    CONSTRAINT "orders_return_status_check" CHECK ((("return_status" IS NULL) OR ("return_status" = ANY (ARRAY['pending'::"text", 'shipped'::"text", 'delivered'::"text"])))),
    CONSTRAINT "orders_review_rating_check" CHECK ((("review_rating" IS NULL) OR (("review_rating" >= 1) AND ("review_rating" <= 5)))),
    CONSTRAINT "orders_status_check" CHECK (("status" = ANY (ARRAY['pending_payment'::"text", 'paid'::"text", 'auth_submitted'::"text", 'label_created'::"text", 'shipped'::"text", 'delivered'::"text", 'review_window'::"text", 'completed'::"text", 'disputed'::"text", 'cancelled'::"text", 'refund_pending'::"text", 'refunded'::"text", 'payout_failed'::"text", 'return_pending'::"text", 'return_shipped'::"text", 'return_delivered'::"text"])))
);


ALTER TABLE "public"."orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."post_likes" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "post_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."post_likes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."posts" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "seller_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "images" "text"[],
    "likes_count" integer DEFAULT 0,
    "is_rising_brand" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "related_listing_id" "uuid",
    "is_custom_brand" boolean DEFAULT false
);


ALTER TABLE "public"."posts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "full_name" "text",
    "username" "text" NOT NULL,
    "avatar_url" "text",
    "role" "text" DEFAULT 'buyer'::"text" NOT NULL,
    "is_verified_seller" boolean DEFAULT false,
    "seller_application_status" "text" DEFAULT 'none'::"text" NOT NULL,
    "stripe_account_id" "text",
    "ship_from_address" "jsonb",
    "profile_banner_url" "text",
    "display_name" "text",
    "shop_name" "text",
    "profile_theme" "text" DEFAULT 'default'::"text",
    "bio" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "is_banned" boolean DEFAULT false,
    "ban_reason" "text",
    "dispute_flags_count" integer DEFAULT 0,
    "followers_count" integer DEFAULT 0,
    "sales_count" integer DEFAULT 0,
    "avg_rating" numeric(3,2) DEFAULT 0,
    "instagram_url" "text",
    "customer_messaging_enabled" boolean DEFAULT false NOT NULL,
    "offers_enabled" boolean DEFAULT false NOT NULL,
    "vacation_mode_enabled" boolean DEFAULT false NOT NULL,
    CONSTRAINT "profiles_role_check" CHECK (("role" = ANY (ARRAY['buyer'::"text", 'seller'::"text", 'admin'::"text"]))),
    CONSTRAINT "profiles_seller_application_status_check" CHECK (("seller_application_status" = ANY (ARRAY['none'::"text", 'pending'::"text", 'approved'::"text", 'rejected'::"text", 'rejected_final'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reviews" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "reviewer_id" "uuid" NOT NULL,
    "seller_id" "uuid" NOT NULL,
    "rating" integer NOT NULL,
    "comment" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "reviews_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 5)))
);


ALTER TABLE "public"."reviews" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."seller_applications" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "ship_from_address" "jsonb",
    "questionnaire_responses" "jsonb",
    "stripe_connected" boolean DEFAULT false,
    "terms_accepted" boolean DEFAULT false,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "admin_notes" "text",
    "ai_recommendation" "text",
    "rejection_count" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "seller_applications_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."seller_applications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."site_settings" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "onboarding_active" boolean DEFAULT true NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."site_settings" OWNER TO "postgres";


ALTER TABLE ONLY "public"."catalog_products"
    ADD CONSTRAINT "catalog_products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."catalog_products"
    ADD CONSTRAINT "catalog_products_sku_key" UNIQUE ("sku");



ALTER TABLE ONLY "public"."catalog_products"
    ADD CONSTRAINT "catalog_products_sku_normalized_key" UNIQUE ("sku_normalized");



ALTER TABLE ONLY "public"."conversation_reads"
    ADD CONSTRAINT "conversation_reads_pkey" PRIMARY KEY ("user_id", "conversation_id");



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."custom_offers"
    ADD CONSTRAINT "custom_offers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."follows"
    ADD CONSTRAINT "follows_follower_id_following_id_key" UNIQUE ("follower_id", "following_id");



ALTER TABLE ONLY "public"."follows"
    ADD CONSTRAINT "follows_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."listing_variants"
    ADD CONSTRAINT "listing_variants_listing_id_size_key" UNIQUE ("listing_id", "size");



ALTER TABLE ONLY "public"."listing_variants"
    ADD CONSTRAINT "listing_variants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."listings"
    ADD CONSTRAINT "listings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."post_likes"
    ADD CONSTRAINT "post_likes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."post_likes"
    ADD CONSTRAINT "post_likes_post_id_user_id_key" UNIQUE ("post_id", "user_id");



ALTER TABLE ONLY "public"."posts"
    ADD CONSTRAINT "posts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_username_key" UNIQUE ("username");



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_order_id_key" UNIQUE ("order_id");



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."seller_applications"
    ADD CONSTRAINT "seller_applications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."site_settings"
    ADD CONSTRAINT "site_settings_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_catalog_products_sku_normalized" ON "public"."catalog_products" USING "btree" ("sku_normalized");



CREATE INDEX "idx_conversation_reads_conversation_id" ON "public"."conversation_reads" USING "btree" ("conversation_id");



CREATE INDEX "idx_conversation_reads_user_id" ON "public"."conversation_reads" USING "btree" ("user_id");



CREATE INDEX "idx_conversations_created_at" ON "public"."conversations" USING "btree" ("created_at");



CREATE INDEX "idx_conversations_listing_id" ON "public"."conversations" USING "btree" ("listing_id");



CREATE INDEX "idx_conversations_participant_ids" ON "public"."conversations" USING "gin" ("participant_ids");



CREATE INDEX "idx_custom_offers_conversation_id" ON "public"."custom_offers" USING "btree" ("conversation_id");



CREATE INDEX "idx_custom_offers_listing_id" ON "public"."custom_offers" USING "btree" ("listing_id");



CREATE INDEX "idx_custom_offers_listing_variant_id" ON "public"."custom_offers" USING "btree" ("listing_variant_id");



CREATE INDEX "idx_custom_offers_sender_id" ON "public"."custom_offers" USING "btree" ("sender_id");



CREATE INDEX "idx_custom_offers_status" ON "public"."custom_offers" USING "btree" ("status");



CREATE INDEX "idx_follows_follower_id" ON "public"."follows" USING "btree" ("follower_id");



CREATE INDEX "idx_follows_following_id" ON "public"."follows" USING "btree" ("following_id");



CREATE INDEX "idx_listing_variants_active" ON "public"."listing_variants" USING "btree" ("listing_id", "is_active");



CREATE INDEX "idx_listing_variants_listing_id" ON "public"."listing_variants" USING "btree" ("listing_id");



CREATE INDEX "idx_listings_brand" ON "public"."listings" USING "btree" ("brand");



CREATE INDEX "idx_listings_catalog_product_id" ON "public"."listings" USING "btree" ("catalog_product_id");



CREATE INDEX "idx_listings_created_at" ON "public"."listings" USING "btree" ("created_at");



CREATE INDEX "idx_listings_seller_id" ON "public"."listings" USING "btree" ("seller_id");



CREATE INDEX "idx_listings_seller_updated_at" ON "public"."listings" USING "btree" ("seller_id", "updated_at" DESC);



CREATE INDEX "idx_listings_status" ON "public"."listings" USING "btree" ("status");



CREATE UNIQUE INDEX "idx_listings_unique_seller_sku" ON "public"."listings" USING "btree" ("seller_id", "sku_normalized") WHERE (("sku_normalized" IS NOT NULL) AND ("status" <> 'removed'::"text"));



CREATE INDEX "idx_messages_conversation_id" ON "public"."messages" USING "btree" ("conversation_id");



CREATE INDEX "idx_messages_created_at" ON "public"."messages" USING "btree" ("created_at");



CREATE INDEX "idx_messages_sender_id" ON "public"."messages" USING "btree" ("sender_id");



CREATE INDEX "idx_orders_buyer_id" ON "public"."orders" USING "btree" ("buyer_id");



CREATE INDEX "idx_orders_created_at" ON "public"."orders" USING "btree" ("created_at");



CREATE INDEX "idx_orders_custom_offer_id" ON "public"."orders" USING "btree" ("custom_offer_id");



CREATE INDEX "idx_orders_listing_id" ON "public"."orders" USING "btree" ("listing_id");



CREATE INDEX "idx_orders_listing_variant_id" ON "public"."orders" USING "btree" ("listing_variant_id");



CREATE INDEX "idx_orders_seller_id" ON "public"."orders" USING "btree" ("seller_id");



CREATE INDEX "idx_orders_status" ON "public"."orders" USING "btree" ("status");



CREATE INDEX "idx_post_likes_post_id" ON "public"."post_likes" USING "btree" ("post_id");



CREATE INDEX "idx_post_likes_user_id" ON "public"."post_likes" USING "btree" ("user_id");



CREATE INDEX "idx_posts_created_at" ON "public"."posts" USING "btree" ("created_at");



CREATE INDEX "idx_posts_is_custom_brand" ON "public"."posts" USING "btree" ("is_custom_brand");



CREATE INDEX "idx_posts_is_rising_brand" ON "public"."posts" USING "btree" ("is_rising_brand");



CREATE INDEX "idx_posts_related_listing_id" ON "public"."posts" USING "btree" ("related_listing_id");



CREATE INDEX "idx_posts_seller_id" ON "public"."posts" USING "btree" ("seller_id");



CREATE INDEX "idx_profiles_email" ON "public"."profiles" USING "btree" ("email");



CREATE INDEX "idx_profiles_role" ON "public"."profiles" USING "btree" ("role");



CREATE INDEX "idx_profiles_username" ON "public"."profiles" USING "btree" ("username");



CREATE INDEX "idx_reviews_order_id" ON "public"."reviews" USING "btree" ("order_id");



CREATE INDEX "idx_reviews_reviewer_id" ON "public"."reviews" USING "btree" ("reviewer_id");



CREATE INDEX "idx_reviews_seller_id" ON "public"."reviews" USING "btree" ("seller_id");



CREATE INDEX "idx_seller_applications_created_at" ON "public"."seller_applications" USING "btree" ("created_at");



CREATE INDEX "idx_seller_applications_status" ON "public"."seller_applications" USING "btree" ("status");



CREATE INDEX "idx_seller_applications_user_id" ON "public"."seller_applications" USING "btree" ("user_id");



CREATE OR REPLACE TRIGGER "follows_decrement" AFTER DELETE ON "public"."follows" FOR EACH ROW EXECUTE FUNCTION "public"."on_follow_deleted"();



CREATE OR REPLACE TRIGGER "follows_increment" AFTER INSERT ON "public"."follows" FOR EACH ROW EXECUTE FUNCTION "public"."on_follow_inserted"();



CREATE OR REPLACE TRIGGER "listing_variants_sync_after_delete" AFTER DELETE ON "public"."listing_variants" FOR EACH ROW EXECUTE FUNCTION "public"."on_listing_variant_changed"();



CREATE OR REPLACE TRIGGER "listing_variants_sync_after_insert" AFTER INSERT ON "public"."listing_variants" FOR EACH ROW EXECUTE FUNCTION "public"."on_listing_variant_changed"();



CREATE OR REPLACE TRIGGER "listing_variants_sync_after_update" AFTER UPDATE ON "public"."listing_variants" FOR EACH ROW EXECUTE FUNCTION "public"."on_listing_variant_changed"();



CREATE OR REPLACE TRIGGER "post_likes_decrement" AFTER DELETE ON "public"."post_likes" FOR EACH ROW EXECUTE FUNCTION "public"."on_post_like_deleted"();



CREATE OR REPLACE TRIGGER "post_likes_increment" AFTER INSERT ON "public"."post_likes" FOR EACH ROW EXECUTE FUNCTION "public"."on_post_like_inserted"();



CREATE OR REPLACE TRIGGER "prepare_listing_identity_before_write" BEFORE INSERT OR UPDATE OF "sku", "listing_type" ON "public"."listings" FOR EACH ROW EXECUTE FUNCTION "public"."prepare_listing_identity"();



CREATE OR REPLACE TRIGGER "reviews_update_seller_stats" AFTER INSERT ON "public"."reviews" FOR EACH ROW EXECUTE FUNCTION "public"."on_review_inserted"();



CREATE OR REPLACE TRIGGER "update_catalog_products_updated_at" BEFORE UPDATE ON "public"."catalog_products" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_listing_variants_updated_at" BEFORE UPDATE ON "public"."listing_variants" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_listings_updated_at" BEFORE UPDATE ON "public"."listings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_orders_updated_at" BEFORE UPDATE ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_seller_applications_updated_at" BEFORE UPDATE ON "public"."seller_applications" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."conversation_reads"
    ADD CONSTRAINT "conversation_reads_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversation_reads"
    ADD CONSTRAINT "conversation_reads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."custom_offers"
    ADD CONSTRAINT "custom_offers_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."custom_offers"
    ADD CONSTRAINT "custom_offers_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."custom_offers"
    ADD CONSTRAINT "custom_offers_listing_variant_id_fkey" FOREIGN KEY ("listing_variant_id") REFERENCES "public"."listing_variants"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."custom_offers"
    ADD CONSTRAINT "custom_offers_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."follows"
    ADD CONSTRAINT "follows_follower_id_fkey" FOREIGN KEY ("follower_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."follows"
    ADD CONSTRAINT "follows_following_id_fkey" FOREIGN KEY ("following_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."listing_variants"
    ADD CONSTRAINT "listing_variants_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."listings"
    ADD CONSTRAINT "listings_catalog_product_id_fkey" FOREIGN KEY ("catalog_product_id") REFERENCES "public"."catalog_products"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."listings"
    ADD CONSTRAINT "listings_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_custom_offer_id_fkey" FOREIGN KEY ("custom_offer_id") REFERENCES "public"."custom_offers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_listing_variant_id_fkey" FOREIGN KEY ("listing_variant_id") REFERENCES "public"."listing_variants"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."post_likes"
    ADD CONSTRAINT "post_likes_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."post_likes"
    ADD CONSTRAINT "post_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."posts"
    ADD CONSTRAINT "posts_related_listing_id_fkey" FOREIGN KEY ("related_listing_id") REFERENCES "public"."listings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."posts"
    ADD CONSTRAINT "posts_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."seller_applications"
    ADD CONSTRAINT "seller_applications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



CREATE POLICY "Anyone can read site settings" ON "public"."site_settings" FOR SELECT USING (true);



CREATE POLICY "Buyers can create orders" ON "public"."orders" FOR INSERT WITH CHECK (("auth"."uid"() = "buyer_id"));



CREATE POLICY "Conversation participants can update messages" ON "public"."messages" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."conversations"
  WHERE (("conversations"."id" = "messages"."conversation_id") AND ("auth"."uid"() = ANY ("conversations"."participant_ids"))))));



CREATE POLICY "Conversation participants can update offers" ON "public"."custom_offers" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."conversations"
  WHERE (("conversations"."id" = "custom_offers"."conversation_id") AND ("auth"."uid"() = ANY ("conversations"."participant_ids"))))));



CREATE POLICY "Everyone can read active listings" ON "public"."listings" FOR SELECT USING ((("status" = 'active'::"text") OR ("seller_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))) OR (EXISTS ( SELECT 1
   FROM "public"."orders"
  WHERE (("orders"."listing_id" = "listings"."id") AND (("orders"."buyer_id" = "auth"."uid"()) OR ("orders"."seller_id" = "auth"."uid"())))))));



CREATE POLICY "Everyone can read catalog products" ON "public"."catalog_products" FOR SELECT USING (true);



CREATE POLICY "Everyone can read follows" ON "public"."follows" FOR SELECT USING (true);



CREATE POLICY "Everyone can read listing variants" ON "public"."listing_variants" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."listings"
  WHERE (("listings"."id" = "listing_variants"."listing_id") AND (("listings"."status" = 'active'::"text") OR ("listings"."seller_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."profiles"
          WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))) OR (EXISTS ( SELECT 1
           FROM "public"."orders"
          WHERE (("orders"."listing_id" = "listings"."id") AND (("orders"."buyer_id" = "auth"."uid"()) OR ("orders"."seller_id" = "auth"."uid"()))))))))));



CREATE POLICY "Everyone can read post likes" ON "public"."post_likes" FOR SELECT USING (true);



CREATE POLICY "Everyone can read posts" ON "public"."posts" FOR SELECT USING (true);



CREATE POLICY "Everyone can read reviews" ON "public"."reviews" FOR SELECT USING (true);



CREATE POLICY "Only admins can delete applications" ON "public"."seller_applications" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Only admins can delete profiles" ON "public"."profiles" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "profiles_1"
  WHERE (("profiles_1"."id" = "auth"."uid"()) AND ("profiles_1"."role" = 'admin'::"text")))));



CREATE POLICY "Only admins can update site settings" ON "public"."site_settings" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Profiles are viewable by everyone" ON "public"."profiles" FOR SELECT USING (true);



CREATE POLICY "Sellers can delete listing variants" ON "public"."listing_variants" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."listings"
  WHERE (("listings"."id" = "listing_variants"."listing_id") AND (("listings"."seller_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."profiles"
          WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))))))));



CREATE POLICY "Sellers can delete their own listings" ON "public"."listings" FOR DELETE USING (("auth"."uid"() = "seller_id"));



CREATE POLICY "Sellers can delete their own posts" ON "public"."posts" FOR DELETE USING (("auth"."uid"() = "seller_id"));



CREATE POLICY "Sellers can insert listing variants" ON "public"."listing_variants" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."listings"
  WHERE (("listings"."id" = "listing_variants"."listing_id") AND (("listings"."seller_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."profiles"
          WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))))))));



CREATE POLICY "Sellers can insert their own listings" ON "public"."listings" FOR INSERT WITH CHECK ((("auth"."uid"() = "seller_id") AND (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND (("profiles"."role" = 'seller'::"text") OR ("profiles"."role" = 'admin'::"text")))))));



CREATE POLICY "Sellers can insert their own posts" ON "public"."posts" FOR INSERT WITH CHECK ((("auth"."uid"() = "seller_id") AND (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND (("profiles"."role" = 'seller'::"text") OR ("profiles"."role" = 'admin'::"text")))))));



CREATE POLICY "Sellers can update listing variants" ON "public"."listing_variants" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."listings"
  WHERE (("listings"."id" = "listing_variants"."listing_id") AND (("listings"."seller_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."profiles"
          WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))))))));



CREATE POLICY "Sellers can update their own listings" ON "public"."listings" FOR UPDATE USING ((("auth"."uid"() = "seller_id") OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text"))))));



CREATE POLICY "Sellers can update their own posts" ON "public"."posts" FOR UPDATE USING (("auth"."uid"() = "seller_id"));



CREATE POLICY "Users can create applications" ON "public"."seller_applications" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own follows" ON "public"."follows" FOR DELETE USING (("auth"."uid"() = "follower_id"));



CREATE POLICY "Users can delete their own likes" ON "public"."post_likes" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own reviews" ON "public"."reviews" FOR DELETE USING (("auth"."uid"() = "reviewer_id"));



CREATE POLICY "Users can insert conversations" ON "public"."conversations" FOR INSERT WITH CHECK ((("auth"."uid"() = ANY ("participant_ids")) AND (NOT (EXISTS ( SELECT 1
   FROM ("public"."profiles" "sender_profile"
     JOIN "public"."profiles" "recipient_profile" ON (("recipient_profile"."id" = ANY ("conversations"."participant_ids"))))
  WHERE (("sender_profile"."id" = "auth"."uid"()) AND ("recipient_profile"."id" <> "auth"."uid"()) AND ("sender_profile"."role" = 'buyer'::"text") AND ("recipient_profile"."role" = ANY (ARRAY['seller'::"text", 'admin'::"text"])) AND (("recipient_profile"."customer_messaging_enabled" = false) OR ("recipient_profile"."vacation_mode_enabled" = true))))))));



CREATE POLICY "Users can insert custom offers to their conversations" ON "public"."custom_offers" FOR INSERT WITH CHECK ((("auth"."uid"() = "sender_id") AND (EXISTS ( SELECT 1
   FROM "public"."conversations"
  WHERE (("conversations"."id" = "custom_offers"."conversation_id") AND ("auth"."uid"() = ANY ("conversations"."participant_ids"))))) AND (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND (("profiles"."role" = 'admin'::"text") OR ("profiles"."offers_enabled" = true)))))));



CREATE POLICY "Users can insert follows" ON "public"."follows" FOR INSERT WITH CHECK (("auth"."uid"() = "follower_id"));



CREATE POLICY "Users can insert likes" ON "public"."post_likes" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert messages to their conversations" ON "public"."messages" FOR INSERT WITH CHECK ((("auth"."uid"() = "sender_id") AND (EXISTS ( SELECT 1
   FROM "public"."conversations"
  WHERE (("conversations"."id" = "messages"."conversation_id") AND ("auth"."uid"() = ANY ("conversations"."participant_ids"))))) AND (("message_type" <> 'custom_offer'::"text") OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND (("profiles"."role" = 'admin'::"text") OR ("profiles"."offers_enabled" = true)))))) AND (NOT (EXISTS ( SELECT 1
   FROM (("public"."conversations"
     JOIN "public"."profiles" "sender_profile" ON (("sender_profile"."id" = "auth"."uid"())))
     JOIN "public"."profiles" "recipient_profile" ON (("recipient_profile"."id" = ANY ("conversations"."participant_ids"))))
  WHERE (("conversations"."id" = "messages"."conversation_id") AND ("recipient_profile"."id" <> "auth"."uid"()) AND ("sender_profile"."role" = 'buyer'::"text") AND ("recipient_profile"."role" = ANY (ARRAY['seller'::"text", 'admin'::"text"])) AND (("recipient_profile"."customer_messaging_enabled" = false) OR ("recipient_profile"."vacation_mode_enabled" = true))))))));



CREATE POLICY "Users can insert reviews for their orders" ON "public"."reviews" FOR INSERT WITH CHECK ((("auth"."uid"() = "reviewer_id") AND (EXISTS ( SELECT 1
   FROM "public"."orders"
  WHERE (("orders"."id" = "reviews"."order_id") AND (("auth"."uid"() = "orders"."buyer_id") OR ("auth"."uid"() = "orders"."seller_id")))))));



CREATE POLICY "Users can insert their own profile" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can read conversations they're in" ON "public"."conversations" FOR SELECT USING ((("auth"."uid"() = ANY ("participant_ids")) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text"))))));



CREATE POLICY "Users can read custom offers from their conversations" ON "public"."custom_offers" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."conversations"
  WHERE (("conversations"."id" = "custom_offers"."conversation_id") AND ("auth"."uid"() = ANY ("conversations"."participant_ids"))))));



CREATE POLICY "Users can read messages from their conversations" ON "public"."messages" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."conversations"
  WHERE (("conversations"."id" = "messages"."conversation_id") AND (("auth"."uid"() = ANY ("conversations"."participant_ids")) OR (EXISTS ( SELECT 1
           FROM "public"."profiles"
          WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))))))));



CREATE POLICY "Users can read their own applications" ON "public"."seller_applications" FOR SELECT USING ((("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text"))))));



CREATE POLICY "Users can read their own conversation_reads" ON "public"."conversation_reads" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read their own orders" ON "public"."orders" FOR SELECT USING ((("auth"."uid"() = "buyer_id") OR ("auth"."uid"() = "seller_id") OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text"))))));



CREATE POLICY "Users can update conversations they're in" ON "public"."conversations" FOR UPDATE USING ((("auth"."uid"() = ANY ("participant_ids")) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text"))))));



CREATE POLICY "Users can update custom offers in their conversations" ON "public"."custom_offers" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."conversations"
  WHERE (("conversations"."id" = "custom_offers"."conversation_id") AND ("auth"."uid"() = ANY ("conversations"."participant_ids"))))));



CREATE POLICY "Users can update messages in their conversations" ON "public"."messages" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."conversations"
  WHERE (("conversations"."id" = "messages"."conversation_id") AND ("auth"."uid"() = ANY ("conversations"."participant_ids"))))));



CREATE POLICY "Users can update their orders" ON "public"."orders" FOR UPDATE USING ((("auth"."uid"() = "buyer_id") OR ("auth"."uid"() = "seller_id") OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text"))))));



CREATE POLICY "Users can update their own applications" ON "public"."seller_applications" FOR UPDATE USING ((("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text"))))));



CREATE POLICY "Users can update their own conversation_reads" ON "public"."conversation_reads" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can update their own reviews" ON "public"."reviews" FOR UPDATE USING (("auth"."uid"() = "reviewer_id"));



CREATE POLICY "Users can upsert their own conversation_reads" ON "public"."conversation_reads" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."catalog_products" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."conversation_reads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."conversations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."custom_offers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."follows" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."listing_variants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."listings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."orders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."post_likes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."posts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."reviews" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."seller_applications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."site_settings" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."messages";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."orders";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































GRANT ALL ON FUNCTION "public"."decrement_listing_variant_inventory"("target_listing_variant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."decrement_listing_variant_inventory"("target_listing_variant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."decrement_listing_variant_inventory"("target_listing_variant_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."decrement_post_likes"("post_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."decrement_post_likes"("post_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."decrement_post_likes"("post_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_random_username"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_random_username"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_random_username"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_post_likes"("post_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."increment_post_likes"("post_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_post_likes"("post_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_username_available"("username_check" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_username_available"("username_check" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_username_available"("username_check" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."normalize_listing_sku"("raw_sku" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."normalize_listing_sku"("raw_sku" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."normalize_listing_sku"("raw_sku" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."on_follow_deleted"() TO "anon";
GRANT ALL ON FUNCTION "public"."on_follow_deleted"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."on_follow_deleted"() TO "service_role";



GRANT ALL ON FUNCTION "public"."on_follow_inserted"() TO "anon";
GRANT ALL ON FUNCTION "public"."on_follow_inserted"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."on_follow_inserted"() TO "service_role";



GRANT ALL ON FUNCTION "public"."on_listing_variant_changed"() TO "anon";
GRANT ALL ON FUNCTION "public"."on_listing_variant_changed"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."on_listing_variant_changed"() TO "service_role";



GRANT ALL ON FUNCTION "public"."on_post_like_deleted"() TO "anon";
GRANT ALL ON FUNCTION "public"."on_post_like_deleted"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."on_post_like_deleted"() TO "service_role";



GRANT ALL ON FUNCTION "public"."on_post_like_inserted"() TO "anon";
GRANT ALL ON FUNCTION "public"."on_post_like_inserted"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."on_post_like_inserted"() TO "service_role";



GRANT ALL ON FUNCTION "public"."on_review_inserted"() TO "anon";
GRANT ALL ON FUNCTION "public"."on_review_inserted"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."on_review_inserted"() TO "service_role";



GRANT ALL ON FUNCTION "public"."prepare_listing_identity"() TO "anon";
GRANT ALL ON FUNCTION "public"."prepare_listing_identity"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prepare_listing_identity"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_listing_from_variants"("target_listing_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."sync_listing_from_variants"("target_listing_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_listing_from_variants"("target_listing_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";


















GRANT ALL ON TABLE "public"."catalog_products" TO "anon";
GRANT ALL ON TABLE "public"."catalog_products" TO "authenticated";
GRANT ALL ON TABLE "public"."catalog_products" TO "service_role";



GRANT ALL ON TABLE "public"."conversation_reads" TO "anon";
GRANT ALL ON TABLE "public"."conversation_reads" TO "authenticated";
GRANT ALL ON TABLE "public"."conversation_reads" TO "service_role";



GRANT ALL ON TABLE "public"."conversations" TO "anon";
GRANT ALL ON TABLE "public"."conversations" TO "authenticated";
GRANT ALL ON TABLE "public"."conversations" TO "service_role";



GRANT ALL ON TABLE "public"."custom_offers" TO "anon";
GRANT ALL ON TABLE "public"."custom_offers" TO "authenticated";
GRANT ALL ON TABLE "public"."custom_offers" TO "service_role";



GRANT ALL ON TABLE "public"."follows" TO "anon";
GRANT ALL ON TABLE "public"."follows" TO "authenticated";
GRANT ALL ON TABLE "public"."follows" TO "service_role";



GRANT ALL ON TABLE "public"."listing_variants" TO "anon";
GRANT ALL ON TABLE "public"."listing_variants" TO "authenticated";
GRANT ALL ON TABLE "public"."listing_variants" TO "service_role";



GRANT ALL ON TABLE "public"."listings" TO "anon";
GRANT ALL ON TABLE "public"."listings" TO "authenticated";
GRANT ALL ON TABLE "public"."listings" TO "service_role";



GRANT ALL ON TABLE "public"."messages" TO "anon";
GRANT ALL ON TABLE "public"."messages" TO "authenticated";
GRANT ALL ON TABLE "public"."messages" TO "service_role";



GRANT ALL ON TABLE "public"."orders" TO "anon";
GRANT ALL ON TABLE "public"."orders" TO "authenticated";
GRANT ALL ON TABLE "public"."orders" TO "service_role";



GRANT ALL ON TABLE "public"."post_likes" TO "anon";
GRANT ALL ON TABLE "public"."post_likes" TO "authenticated";
GRANT ALL ON TABLE "public"."post_likes" TO "service_role";



GRANT ALL ON TABLE "public"."posts" TO "anon";
GRANT ALL ON TABLE "public"."posts" TO "authenticated";
GRANT ALL ON TABLE "public"."posts" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."reviews" TO "anon";
GRANT ALL ON TABLE "public"."reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."reviews" TO "service_role";



GRANT ALL ON TABLE "public"."seller_applications" TO "anon";
GRANT ALL ON TABLE "public"."seller_applications" TO "authenticated";
GRANT ALL ON TABLE "public"."seller_applications" TO "service_role";



GRANT ALL ON TABLE "public"."site_settings" TO "anon";
GRANT ALL ON TABLE "public"."site_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."site_settings" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































