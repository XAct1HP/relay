


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






CREATE OR REPLACE FUNCTION "public"."create_relay_balance_order_purchase"("p_buyer_id" "uuid", "p_seller_id" "uuid", "p_listing_id" "uuid", "p_listing_variant_id" "uuid", "p_listing_used_item_id" "uuid", "p_custom_offer_id" "uuid", "p_size" "text", "p_shoe_price_cents" bigint, "p_shipping_cost_cents" bigint, "p_total_charge_cents" bigint, "p_relay_fee_cents" bigint, "p_stripe_fee_estimate_cents" bigint, "p_seller_proceeds_cents" bigint, "p_buyer_shipping_address" "jsonb", "p_challenge_code" "text", "p_shipping_deadline" timestamp with time zone, "p_purchased_condition_photo_url" "text", "p_auth_snapshot" "jsonb", "p_payout_snapshot" "jsonb", "p_checkout_idempotency_key" "text") RETURNS TABLE("order_id" "uuid", "created" boolean)
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  existing_order_id UUID;
  buyer_available_balance BIGINT := 0;
  buyer_balance_row_id UUID;
  order_payout_step TEXT := 'final_release';
  listing_sizes JSONB;
  legacy_size_index INT;
  legacy_size_entry JSONB;
  has_available_inventory BOOLEAN := false;
BEGIN
  IF p_buyer_id IS NULL OR p_seller_id IS NULL OR p_listing_id IS NULL THEN
    RAISE EXCEPTION 'Missing required Relay Balance checkout identifiers.';
  END IF;

  IF p_buyer_id = p_seller_id THEN
    RAISE EXCEPTION 'Buyer cannot purchase their own listing.';
  END IF;

  IF COALESCE(BTRIM(p_checkout_idempotency_key), '') = '' THEN
    RAISE EXCEPTION 'Relay Balance checkout idempotency key is required.';
  END IF;

  SELECT o.id
  INTO existing_order_id
  FROM public.orders AS o
  WHERE o.relay_balance_payment_idempotency_key = p_checkout_idempotency_key
  LIMIT 1;

  IF existing_order_id IS NOT NULL THEN
    RETURN QUERY SELECT existing_order_id, FALSE;
    RETURN;
  END IF;

  INSERT INTO public.relay_balances (
    seller_id,
    total_balance_cents,
    available_balance_cents,
    pending_balance_cents,
    exposure_cents,
    withdrawable_balance_cents,
    updated_at
  )
  VALUES (
    p_buyer_id,
    0,
    0,
    0,
    0,
    0,
    NOW()
  )
  ON CONFLICT (seller_id) DO NOTHING;

  SELECT rb.id, COALESCE(rb.available_balance_cents, 0)
  INTO buyer_balance_row_id, buyer_available_balance
  FROM public.relay_balances AS rb
  WHERE rb.seller_id = p_buyer_id
  FOR UPDATE;

  IF buyer_balance_row_id IS NULL THEN
    buyer_available_balance := 0;
  END IF;

  IF buyer_available_balance < COALESCE(p_total_charge_cents, 0) THEN
    RAISE EXCEPTION 'Insufficient Relay Balance available for this purchase.';
  END IF;

  IF p_listing_used_item_id IS NOT NULL THEN
    UPDATE public.listing_used_items
    SET
      quantity = 0,
      is_active = FALSE
    WHERE id = p_listing_used_item_id
      AND listing_id = p_listing_id
      AND COALESCE(quantity, 0) = 1
      AND COALESCE(is_active, TRUE) = TRUE
    RETURNING id
    INTO existing_order_id;

    IF existing_order_id IS NULL THEN
      RAISE EXCEPTION 'This used pair is no longer available.';
    END IF;
  ELSIF p_listing_variant_id IS NOT NULL THEN
    UPDATE public.listing_variants
    SET
      quantity = GREATEST(COALESCE(quantity, 0) - 1, 0),
      is_active = CASE
        WHEN GREATEST(COALESCE(quantity, 0) - 1, 0) <= 0 THEN FALSE
        ELSE COALESCE(is_active, TRUE)
      END
    WHERE id = p_listing_variant_id
      AND listing_id = p_listing_id
      AND COALESCE(quantity, 0) > 0
      AND COALESCE(is_active, TRUE) = TRUE
    RETURNING id
    INTO existing_order_id;

    IF existing_order_id IS NULL THEN
      RAISE EXCEPTION 'This size is no longer available.';
    END IF;
  ELSE
    SELECT l.sizes
    INTO listing_sizes
    FROM public.listings AS l
    WHERE l.id = p_listing_id
    FOR UPDATE;

    SELECT element.ordinality - 1, element.value
    INTO legacy_size_index, legacy_size_entry
    FROM jsonb_array_elements(COALESCE(listing_sizes, '[]'::jsonb)) WITH ORDINALITY AS element(value, ordinality)
    WHERE element.value->>'size' = p_size
    LIMIT 1;

    IF legacy_size_entry IS NULL OR COALESCE((legacy_size_entry->>'quantity')::INT, 0) <= 0 THEN
      RAISE EXCEPTION 'This size is no longer available.';
    END IF;

    listing_sizes := jsonb_set(
      listing_sizes,
      ARRAY[legacy_size_index::TEXT, 'quantity'],
      to_jsonb(GREATEST(COALESCE((legacy_size_entry->>'quantity')::INT, 0) - 1, 0))
    );

    UPDATE public.listings
    SET sizes = listing_sizes
    WHERE id = p_listing_id;
  END IF;

  INSERT INTO public.orders (
    listing_id,
    listing_variant_id,
    listing_used_item_id,
    buyer_id,
    seller_id,
    custom_offer_id,
    status,
    size,
    price,
    shipping_cost,
    platform_fee,
    stripe_fee,
    seller_earnings,
    relay_fee_cents,
    stripe_fee_estimate_cents,
    seller_proceeds_cents,
    payment_funding_source,
    relay_balance_payment_idempotency_key,
    stripe_settlement_status,
    challenge_code,
    buyer_shipping_address,
    shipping_deadline,
    purchased_condition_photo_url,
    relay_tag_required,
    checkcheck_required,
    checkcheck_reason,
    checkcheck_status,
    random_audit_required,
    random_audit_rate_bps_snapshot,
    high_risk_sku_required,
    high_risk_sku_id,
    high_risk_sku_reason,
    auth_requirements_evaluated_at,
    seller_tier_snapshot,
    payout_schedule,
    reserve_percentage_bps_snapshot,
    reserve_hold_duration_days_snapshot,
    minimum_reserve_balance_cents_snapshot,
    balance_credit_status
  )
  VALUES (
    p_listing_id,
    p_listing_variant_id,
    p_listing_used_item_id,
    p_buyer_id,
    p_seller_id,
    p_custom_offer_id,
    'paid',
    p_size,
    (COALESCE(p_shoe_price_cents, 0)::NUMERIC / 100.0),
    (COALESCE(p_shipping_cost_cents, 0)::NUMERIC / 100.0),
    (COALESCE(p_relay_fee_cents, 0)::NUMERIC / 100.0),
    (COALESCE(p_stripe_fee_estimate_cents, 0)::NUMERIC / 100.0),
    (COALESCE(p_seller_proceeds_cents, 0)::NUMERIC / 100.0),
    COALESCE(p_relay_fee_cents, 0),
    COALESCE(p_stripe_fee_estimate_cents, 0),
    COALESCE(p_seller_proceeds_cents, 0),
    'relay_balance',
    p_checkout_idempotency_key,
    'not_applicable',
    p_challenge_code,
    COALESCE(p_buyer_shipping_address, '{}'::jsonb),
    p_shipping_deadline,
    NULLIF(p_purchased_condition_photo_url, ''),
    COALESCE((p_auth_snapshot->>'relayTagRequired')::BOOLEAN, FALSE),
    COALESCE((p_auth_snapshot->>'checkcheckRequired')::BOOLEAN, FALSE),
    NULLIF(p_auth_snapshot->>'checkcheckReason', ''),
    COALESCE(NULLIF(p_auth_snapshot->>'checkcheckStatus', ''), 'not_required'),
    COALESCE((p_auth_snapshot->>'randomAuditRequired')::BOOLEAN, FALSE),
    NULLIF(p_auth_snapshot->>'randomAuditRateBpsSnapshot', '')::INT,
    COALESCE((p_auth_snapshot->>'highRiskSkuRequired')::BOOLEAN, FALSE),
    NULLIF(p_auth_snapshot->>'highRiskSkuId', ''),
    NULLIF(p_auth_snapshot->>'highRiskSkuReason', ''),
    NULLIF(p_auth_snapshot->>'authRequirementsEvaluatedAt', '')::TIMESTAMPTZ,
    COALESCE(NULLIF(p_payout_snapshot->>'sellerTierSnapshot', ''), 'tier_1'),
    COALESCE(NULLIF(p_payout_snapshot->>'payoutSchedule', ''), 'buyer_confirmation_or_review_expiry'),
    COALESCE(NULLIF(p_payout_snapshot->>'reservePercentageBps', '')::INT, 0),
    NULLIF(p_payout_snapshot->>'reserveHoldDurationDays', '')::INT,
    COALESCE(NULLIF(p_payout_snapshot->>'minimumReserveBalanceCents', '')::BIGINT, 0),
    'pending'
  )
  RETURNING id
  INTO order_id;

  INSERT INTO public.relay_balance_ledger (
    seller_id,
    order_id,
    type,
    amount_cents,
    currency,
    status,
    metadata
  )
  VALUES (
    p_buyer_id,
    order_id,
    'relay_balance_purchase_debit',
    -COALESCE(p_total_charge_cents, 0),
    'usd',
    'posted',
    jsonb_build_object(
      'source', 'relay_balance_checkout',
      'idempotency_key', 'relay_balance_purchase:' || p_checkout_idempotency_key || ':buyer_debit',
      'payment_funding_source', 'relay_balance',
      'counterparty_user_id', p_seller_id,
      'order_total_cents', COALESCE(p_total_charge_cents, 0)
    )
  );

  INSERT INTO public.relay_balance_ledger (
    seller_id,
    order_id,
    type,
    amount_cents,
    currency,
    status,
    metadata
  )
  VALUES (
    p_seller_id,
    order_id,
    'order_pending_credit',
    COALESCE(p_seller_proceeds_cents, 0),
    'usd',
    'posted',
    jsonb_build_object(
      'source', 'relay_balance_checkout',
      'idempotency_key', 'money:order:' || order_id::TEXT || ':pending_credit',
      'seller_tier', COALESCE(NULLIF(p_payout_snapshot->>'sellerTierSnapshot', ''), 'tier_1'),
      'payment_funding_source', 'relay_balance',
      'buyer_id', p_buyer_id
    )
  );

  INSERT INTO public.order_payouts (
    order_id,
    seller_id,
    payout_step,
    payment_source_type,
    stripe_settlement_status,
    status,
    gross_amount_cents,
    reserve_withheld_cents,
    minimum_balance_top_up_cents,
    net_paid_cents,
    stripe_transfer_id,
    idempotency_key,
    trigger_source,
    metadata
  )
  VALUES (
    order_id,
    p_seller_id,
    order_payout_step,
    'relay_balance',
    'not_applicable',
    'pending',
    COALESCE(p_seller_proceeds_cents, 0),
    0,
    0,
    COALESCE(p_seller_proceeds_cents, 0),
    NULL,
    'order-payout-' || order_id::TEXT || '-' || order_payout_step,
    'relay_balance_checkout',
    jsonb_build_object(
      'releaseDestination', 'relay_balance',
      'paymentSourceType', 'relay_balance',
      'createdAtCheckout', TRUE
    )
  )
  ON CONFLICT (order_id, payout_step) DO UPDATE
  SET
    payment_source_type = EXCLUDED.payment_source_type,
    stripe_settlement_status = EXCLUDED.stripe_settlement_status,
    gross_amount_cents = EXCLUDED.gross_amount_cents,
    reserve_withheld_cents = EXCLUDED.reserve_withheld_cents,
    minimum_balance_top_up_cents = EXCLUDED.minimum_balance_top_up_cents,
    net_paid_cents = EXCLUDED.net_paid_cents,
    trigger_source = EXCLUDED.trigger_source,
    metadata = EXCLUDED.metadata;

  IF p_custom_offer_id IS NOT NULL THEN
    UPDATE public.custom_offers
    SET status = 'accepted'
    WHERE id = p_custom_offer_id;
  END IF;

  SELECT
    EXISTS (
      SELECT 1
      FROM public.listing_variants AS lv
      WHERE lv.listing_id = p_listing_id
        AND COALESCE(lv.quantity, 0) > 0
        AND COALESCE(lv.is_active, TRUE) = TRUE
    )
    OR EXISTS (
      SELECT 1
      FROM public.listing_used_items AS lui
      WHERE lui.listing_id = p_listing_id
        AND COALESCE(lui.quantity, 0) > 0
        AND COALESCE(lui.is_active, TRUE) = TRUE
    )
    OR EXISTS (
      SELECT 1
      FROM public.listings AS l
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(l.sizes, '[]'::jsonb)) AS element(value)
      WHERE l.id = p_listing_id
        AND COALESCE((element.value->>'quantity')::INT, 0) > 0
    )
  INTO has_available_inventory;

  UPDATE public.listings
  SET status = CASE
    WHEN has_available_inventory THEN 'active'
    ELSE 'sold_out'
  END
  WHERE id = p_listing_id
    AND status IN ('active', 'sold_out');

  RETURN QUERY SELECT order_id, TRUE;
END;
$$;


ALTER FUNCTION "public"."create_relay_balance_order_purchase"("p_buyer_id" "uuid", "p_seller_id" "uuid", "p_listing_id" "uuid", "p_listing_variant_id" "uuid", "p_listing_used_item_id" "uuid", "p_custom_offer_id" "uuid", "p_size" "text", "p_shoe_price_cents" bigint, "p_shipping_cost_cents" bigint, "p_total_charge_cents" bigint, "p_relay_fee_cents" bigint, "p_stripe_fee_estimate_cents" bigint, "p_seller_proceeds_cents" bigint, "p_buyer_shipping_address" "jsonb", "p_challenge_code" "text", "p_shipping_deadline" timestamp with time zone, "p_purchased_condition_photo_url" "text", "p_auth_snapshot" "jsonb", "p_payout_snapshot" "jsonb", "p_checkout_idempotency_key" "text") OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "public"."prevent_relay_balance_ledger_mutation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'relay_balance_ledger is append-only; % is not allowed', TG_OP;
END;
$$;


ALTER FUNCTION "public"."prevent_relay_balance_ledger_mutation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recalculate_relay_balance"("target_seller_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  calculated_pending BIGINT := 0;
  calculated_available BIGINT := 0;
BEGIN
  IF target_seller_id IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = target_seller_id
  ) THEN
    DELETE FROM public.relay_balances
    WHERE seller_id = target_seller_id;

    RETURN;
  END IF;

  SELECT
    COALESCE(SUM(
      CASE
        WHEN type = 'order_pending_credit'
          AND status IN ('pending', 'posted', 'completed')
          THEN amount_cents
        WHEN type = 'order_available_credit'
          AND status IN ('pending', 'posted', 'completed')
          THEN -amount_cents
        ELSE 0
      END
    ), 0),
    COALESCE(SUM(
      CASE
        WHEN type = 'order_available_credit'
          AND status IN ('pending', 'posted', 'completed')
          THEN amount_cents
        WHEN type = 'relay_balance_purchase_debit'
          AND status IN ('pending', 'posted', 'completed')
          THEN amount_cents
        WHEN type = 'withdrawal_requested'
          AND status IN ('pending', 'posted', 'completed')
          THEN amount_cents
        WHEN type = 'withdrawal_failed'
          AND status IN ('posted', 'completed')
          THEN amount_cents
        WHEN type = 'dispute_debit'
          AND status IN ('posted', 'completed')
          THEN amount_cents
        WHEN type = 'admin_adjustment'
          AND status IN ('posted', 'completed')
          THEN amount_cents
        ELSE 0
      END
    ), 0)
  INTO calculated_pending, calculated_available
  FROM public.relay_balance_ledger
  WHERE seller_id = target_seller_id;

  INSERT INTO public.relay_balances (
    seller_id,
    total_balance_cents,
    available_balance_cents,
    pending_balance_cents,
    exposure_cents,
    withdrawable_balance_cents,
    updated_at
  )
  VALUES (
    target_seller_id,
    GREATEST(calculated_pending, 0) + calculated_available,
    calculated_available,
    GREATEST(calculated_pending, 0),
    0,
    GREATEST(calculated_available, 0),
    NOW()
  )
  ON CONFLICT (seller_id) DO UPDATE
  SET
    total_balance_cents = EXCLUDED.total_balance_cents,
    available_balance_cents = EXCLUDED.available_balance_cents,
    pending_balance_cents = EXCLUDED.pending_balance_cents,
    exposure_cents = EXCLUDED.exposure_cents,
    withdrawable_balance_cents = EXCLUDED.withdrawable_balance_cents,
    updated_at = EXCLUDED.updated_at;
END;
$$;


ALTER FUNCTION "public"."recalculate_relay_balance"("target_seller_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_launch_refund_seller_recovery"("p_order_id" "uuid") RETURNS TABLE("order_id" "uuid", "seller_id" "uuid", "buyer_id" "uuid", "payment_funding_source" "text", "seller_proceeds_cents" bigint, "pending_credit_total_cents" bigint, "available_credit_total_cents" bigint, "dispute_debit_total_cents" bigint, "pending_outstanding_cents" bigint, "available_outstanding_cents" bigint, "seller_available_balance_cents" bigint, "recovered_amount_cents" bigint, "recovery_status" "text", "admin_review_required" boolean, "admin_review_reason" "text", "has_completed_withdrawals" boolean)
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  order_row public.orders%ROWTYPE;
  funding_source TEXT;
  pending_credit_total BIGINT := 0;
  available_credit_total BIGINT := 0;
  dispute_debit_total BIGINT := 0;
  pending_outstanding BIGINT := 0;
  available_outstanding BIGINT := 0;
  seller_available BIGINT := 0;
  completed_withdrawals BOOLEAN := FALSE;
BEGIN
  SELECT *
  INTO order_row
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;

  funding_source := COALESCE(
    NULLIF(order_row.payment_funding_source, ''),
    CASE
      WHEN order_row.stripe_payment_intent_id IS NOT NULL THEN 'card'
      ELSE 'relay_balance'
    END
  );

  seller_proceeds_cents := COALESCE(
    order_row.seller_proceeds_cents,
    GREATEST(0, ROUND(COALESCE(order_row.seller_earnings, 0) * 100)::BIGINT),
    0
  );

  PERFORM public.recalculate_relay_balance(order_row.seller_id);

  PERFORM 1
  FROM public.relay_balances
  WHERE seller_id = order_row.seller_id
  FOR UPDATE;

  SELECT COALESCE(available_balance_cents, 0)
  INTO seller_available
  FROM public.relay_balances
  WHERE seller_id = order_row.seller_id;

  SELECT EXISTS (
    SELECT 1
    FROM public.withdrawal_requests
    WHERE seller_id = order_row.seller_id
      AND status = 'completed'
  )
  INTO completed_withdrawals;

  SELECT
    COALESCE(SUM(
      CASE
        WHEN type = 'order_pending_credit'
          AND status IN ('pending', 'posted', 'completed')
          THEN amount_cents
        ELSE 0
      END
    ), 0),
    COALESCE(SUM(
      CASE
        WHEN type = 'order_available_credit'
          AND status IN ('pending', 'posted', 'completed')
          THEN amount_cents
        ELSE 0
      END
    ), 0),
    COALESCE(SUM(
      CASE
        WHEN type = 'dispute_debit'
          AND status IN ('posted', 'completed')
          THEN ABS(amount_cents)
        ELSE 0
      END
    ), 0)
  INTO pending_credit_total, available_credit_total, dispute_debit_total
  FROM public.relay_balance_ledger
  WHERE order_id = order_row.id;

  pending_outstanding := GREATEST(0, pending_credit_total - available_credit_total);
  available_outstanding := GREATEST(0, available_credit_total - dispute_debit_total);

  order_id := order_row.id;
  seller_id := order_row.seller_id;
  buyer_id := order_row.buyer_id;
  payment_funding_source := funding_source;
  pending_credit_total_cents := pending_credit_total;
  available_credit_total_cents := available_credit_total;
  dispute_debit_total_cents := dispute_debit_total;
  pending_outstanding_cents := pending_outstanding;
  available_outstanding_cents := available_outstanding;
  seller_available_balance_cents := seller_available;
  recovered_amount_cents := 0;
  admin_review_required := FALSE;
  admin_review_reason := NULL;
  has_completed_withdrawals := completed_withdrawals;

  IF pending_outstanding = 0 AND available_outstanding = 0 THEN
    recovery_status := 'already_recovered';
    RETURN NEXT;
    RETURN;
  END IF;

  IF pending_outstanding > 0 AND available_outstanding = 0 THEN
    INSERT INTO public.relay_balance_ledger (
      seller_id,
      order_id,
      type,
      amount_cents,
      currency,
      status,
      metadata
    )
    VALUES (
      order_row.seller_id,
      order_row.id,
      'order_available_credit',
      pending_outstanding,
      'usd',
      'posted',
      jsonb_build_object(
        'source', 'launch_refund_recovery',
        'idempotency_key', 'money:order:' || order_row.id::TEXT || ':refund_reversal_available',
        'release_key', 'refund_reversal',
        'release_trigger', 'refund_reversal',
        'forced_release', TRUE,
        'refund_reversal', TRUE,
        'payment_funding_source', funding_source
      )
    )
    ON CONFLICT DO NOTHING;

    INSERT INTO public.relay_balance_ledger (
      seller_id,
      order_id,
      type,
      amount_cents,
      currency,
      status,
      metadata
    )
    VALUES (
      order_row.seller_id,
      order_row.id,
      'dispute_debit',
      -pending_outstanding,
      'usd',
      'posted',
      jsonb_build_object(
        'source', 'launch_refund_recovery',
        'idempotency_key', 'money:order:' || order_row.id::TEXT || ':refund_reversal_debit',
        'refund_recovery_stage', 'pending_reversal',
        'payment_funding_source', funding_source
      )
    )
    ON CONFLICT DO NOTHING;

    UPDATE public.orders
    SET
      balance_credit_status = 'reversed',
      updated_at = NOW()
    WHERE id = order_row.id;

    UPDATE public.order_payouts
    SET
      status = 'cancelled',
      failure_reason = COALESCE(
        failure_reason,
        'Order refunded before seller funds became available.'
      ),
      updated_at = NOW()
    WHERE order_id = order_row.id
      AND status IN ('pending', 'paid', 'frozen');

    recovered_amount_cents := pending_outstanding;
    recovery_status := 'pending_reversed';
    RETURN NEXT;
    RETURN;
  END IF;

  IF pending_outstanding = 0 AND available_outstanding > 0 THEN
    IF seller_available >= available_outstanding THEN
      INSERT INTO public.relay_balance_ledger (
        seller_id,
        order_id,
        type,
        amount_cents,
        currency,
        status,
        metadata
      )
      VALUES (
        order_row.seller_id,
        order_row.id,
        'dispute_debit',
        -available_outstanding,
        'usd',
        'posted',
        jsonb_build_object(
          'source', 'launch_refund_recovery',
          'idempotency_key', 'money:order:' || order_row.id::TEXT || ':refund_available_debit',
          'refund_recovery_stage', 'available_balance_debit',
          'payment_funding_source', funding_source
        )
      )
      ON CONFLICT DO NOTHING;

      UPDATE public.orders
      SET
        balance_credit_status = 'reversed',
        updated_at = NOW()
      WHERE id = order_row.id;

      UPDATE public.order_payouts
      SET
        status = 'cancelled',
        failure_reason = COALESCE(
          failure_reason,
          'Order refunded and seller available balance was recovered.'
        ),
        updated_at = NOW()
      WHERE order_id = order_row.id
        AND status IN ('pending', 'paid', 'frozen');

      recovered_amount_cents := available_outstanding;
      recovery_status := 'available_balance_debited';
      RETURN NEXT;
      RETURN;
    END IF;

    recovery_status := CASE
      WHEN completed_withdrawals THEN 'admin_review_post_withdrawal'
      ELSE 'admin_review_insufficient_available'
    END;
    admin_review_required := TRUE;
    admin_review_reason := CASE
      WHEN completed_withdrawals THEN 'Seller has completed withdrawals and available balance is insufficient for automatic recovery.'
      ELSE 'Seller available balance is insufficient for automatic recovery.'
    END;

    UPDATE public.order_payouts
    SET
      failure_reason = COALESCE(
        failure_reason,
        'Refund requires manual recovery review because seller funds are not fully recoverable.'
      ),
      updated_at = NOW()
    WHERE order_id = order_row.id
      AND status IN ('pending', 'frozen');

    RETURN NEXT;
    RETURN;
  END IF;

  recovery_status := 'admin_review_mixed_credit_state';
  admin_review_required := TRUE;
  admin_review_reason := 'Order has mixed pending and available seller credit state. Manual review is required.';

  UPDATE public.order_payouts
  SET
    failure_reason = COALESCE(
      failure_reason,
      'Refund requires manual review because the order has mixed pending and available seller credit.'
    ),
    updated_at = NOW()
  WHERE order_id = order_row.id
    AND status IN ('pending', 'frozen');

  RETURN NEXT;
END;
$$;


ALTER FUNCTION "public"."resolve_launch_refund_seller_recovery"("p_order_id" "uuid") OWNER TO "postgres";


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
$$;


ALTER FUNCTION "public"."sync_listing_from_variants"("target_listing_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_relay_balance_from_exposure_holds"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  PERFORM public.recalculate_relay_balance(COALESCE(NEW.seller_id, OLD.seller_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."sync_relay_balance_from_exposure_holds"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_relay_balance_from_ledger"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  PERFORM public.recalculate_relay_balance(COALESCE(NEW.seller_id, OLD.seller_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."sync_relay_balance_from_ledger"() OWNER TO "postgres";


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
    "listing_used_item_id" "uuid",
    CONSTRAINT "custom_offers_single_inventory_target_check" CHECK (("num_nonnulls"("listing_variant_id", "listing_used_item_id") <= 1)),
    CONSTRAINT "custom_offers_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'declined'::"text", 'expired'::"text"])))
);


ALTER TABLE "public"."custom_offers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."exposure_holds" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "seller_id" "uuid" NOT NULL,
    "order_id" "uuid" NOT NULL,
    "amount_cents" bigint NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "reason" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "released_at" timestamp with time zone,
    CONSTRAINT "exposure_holds_amount_cents_check" CHECK (("amount_cents" > 0)),
    CONSTRAINT "exposure_holds_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'released'::"text", 'consumed'::"text", 'disputed'::"text"])))
);


ALTER TABLE "public"."exposure_holds" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."follows" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "follower_id" "uuid" NOT NULL,
    "following_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."follows" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."high_risk_skus" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "sku_normalized" "text" NOT NULL,
    "display_sku" "text",
    "risk_reason" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_by_admin_id" "uuid",
    "removed_by_admin_id" "uuid",
    "removed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."high_risk_skus" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."integration_api_logs" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "seller_id" "uuid",
    "api_key_id" "uuid",
    "endpoint" "text" NOT NULL,
    "method" "text" NOT NULL,
    "status_code" integer NOT NULL,
    "request_id" "text" NOT NULL,
    "error_code" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."integration_api_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."listing_used_items" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "listing_id" "uuid" NOT NULL,
    "size" "text" NOT NULL,
    "price" numeric(10,2) NOT NULL,
    "quantity" integer DEFAULT 1 NOT NULL,
    "condition" "text" DEFAULT 'used_good'::"text" NOT NULL,
    "condition_photo_url" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "listing_used_items_condition_check" CHECK (("condition" = ANY (ARRAY['like_new'::"text", 'used_excellent'::"text", 'used_good'::"text", 'used_fair'::"text"]))),
    CONSTRAINT "listing_used_items_condition_photo_url_check" CHECK (("btrim"("condition_photo_url") <> ''::"text")),
    CONSTRAINT "listing_used_items_price_check" CHECK (("price" > (0)::numeric)),
    CONSTRAINT "listing_used_items_quantity_check" CHECK (("quantity" = 1)),
    CONSTRAINT "listing_used_items_size_check" CHECK (("btrim"("size") <> ''::"text"))
);


ALTER TABLE "public"."listing_used_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."listing_variants" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "listing_id" "uuid" NOT NULL,
    "size" "text" NOT NULL,
    "price" numeric(10,2) NOT NULL,
    "quantity" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "condition" "text" DEFAULT 'new'::"text" NOT NULL,
    "needs_condition_photo" boolean DEFAULT false NOT NULL,
    "condition_photo_url" "text",
    CONSTRAINT "listing_variants_condition_check" CHECK ((("condition" IS NULL) OR ("condition" = ANY (ARRAY['new'::"text", 'used'::"text"])))),
    CONSTRAINT "listing_variants_price_check" CHECK (("price" > (0)::numeric)),
    CONSTRAINT "listing_variants_quantity_check" CHECK (("quantity" >= 0))
);


ALTER TABLE "public"."listing_variants" OWNER TO "postgres";


COMMENT ON COLUMN "public"."listing_variants"."condition" IS 'Per-variant condition override: new or used. Falls back to parent listing condition when null.';



COMMENT ON COLUMN "public"."listing_variants"."needs_condition_photo" IS 'Set true when a used variant was imported without a photo. Variant cannot be activated until photo is uploaded.';



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
    "sneaker_id" "uuid",
    "inventory_review_status" "text",
    "inventory_review_notes" "text",
    CONSTRAINT "listings_admin_review_status_check" CHECK (("admin_review_status" = ANY (ARRAY['pending_review'::"text", 'approved'::"text", 'rejected'::"text"]))),
    CONSTRAINT "listings_approx_sizing_check" CHECK (("approx_sizing" = ANY (ARRAY['lightweight'::"text", 'normal'::"text", 'heavy'::"text"]))),
    CONSTRAINT "listings_box_condition_check" CHECK (("box_condition" = ANY (ARRAY['perfect'::"text", 'good'::"text", 'damaged'::"text", 'no_box'::"text"]))),
    CONSTRAINT "listings_condition_check" CHECK (("condition" = ANY (ARRAY['new'::"text", 'like_new'::"text", 'used_excellent'::"text", 'used_good'::"text", 'used_fair'::"text", 'mixed'::"text"]))),
    CONSTRAINT "listings_inventory_review_status_check" CHECK (("inventory_review_status" = 'legacy_used_photo_review_required'::"text")),
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


CREATE TABLE IF NOT EXISTS "public"."order_chain_of_custody" (
    "order_id" "uuid" NOT NULL,
    "relay_tag_id" "uuid",
    "seller_scanned_tag_value" "text",
    "buyer_scanned_tag_value" "text",
    "seller_tag_photo_url" "text",
    "seller_pair_photo_url" "text",
    "seller_box_photo_url" "text",
    "seller_sealed_package_photo_url" "text",
    "buyer_tag_photo_url" "text",
    "buyer_pair_photo_url" "text",
    "verification_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "mismatch_reason" "text",
    "admin_review_required" boolean DEFAULT false NOT NULL,
    "seller_submitted_at" timestamp with time zone,
    "buyer_submitted_at" timestamp with time zone,
    "verified_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "order_chain_of_custody_verification_status_check" CHECK (("verification_status" = ANY (ARRAY['pending'::"text", 'submitted'::"text", 'verified'::"text", 'mismatch'::"text", 'admin_review'::"text"])))
);


ALTER TABLE "public"."order_chain_of_custody" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."order_disputes" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "buyer_id" "uuid",
    "seller_id" "uuid",
    "opened_by_user_id" "uuid",
    "category" "text" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "buyer_description" "text",
    "seller_description" "text",
    "evidence_urls" "text"[] DEFAULT ARRAY[]::"text"[] NOT NULL,
    "buyer_evidence_urls" "text"[] DEFAULT ARRAY[]::"text"[] NOT NULL,
    "seller_evidence_urls" "text"[] DEFAULT ARRAY[]::"text"[] NOT NULL,
    "buyer_scanned_tag_value" "text",
    "seller_funds_frozen" boolean DEFAULT false NOT NULL,
    "admin_resolution" "text",
    "financial_outcome" "text",
    "seller_penalty_outcome" "text",
    "resolved_by_admin_id" "uuid",
    "resolved_at" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "order_disputes_category_check" CHECK (("category" = ANY (ARRAY['authenticity'::"text", 'condition_not_as_listed'::"text", 'wrong_item'::"text", 'tampered_tag'::"text", 'missing_contents'::"text", 'shipping_damage'::"text"]))),
    CONSTRAINT "order_disputes_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'seller_responded'::"text", 'under_review'::"text", 'resolved'::"text", 'closed'::"text"])))
);


ALTER TABLE "public"."order_disputes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."order_payouts" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "seller_id" "uuid" NOT NULL,
    "payout_step" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "gross_amount_cents" bigint DEFAULT 0 NOT NULL,
    "reserve_withheld_cents" bigint DEFAULT 0 NOT NULL,
    "minimum_balance_top_up_cents" bigint DEFAULT 0 NOT NULL,
    "net_paid_cents" bigint DEFAULT 0 NOT NULL,
    "reserve_release_eligible_at" timestamp with time zone,
    "stripe_transfer_id" "text",
    "idempotency_key" "text" NOT NULL,
    "trigger_source" "text",
    "failure_reason" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "paid_at" timestamp with time zone,
    "frozen_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "payment_source_type" "text",
    "stripe_charge_id" "text",
    "stripe_balance_transaction_id" "text",
    "stripe_funds_available_on" timestamp with time zone,
    "stripe_funds_settled_at" timestamp with time zone,
    "stripe_settlement_status" "text",
    CONSTRAINT "order_payouts_gross_amount_cents_check" CHECK (("gross_amount_cents" >= 0)),
    CONSTRAINT "order_payouts_minimum_balance_top_up_cents_check" CHECK (("minimum_balance_top_up_cents" >= 0)),
    CONSTRAINT "order_payouts_net_paid_cents_check" CHECK (("net_paid_cents" >= 0)),
    CONSTRAINT "order_payouts_payment_source_type_check" CHECK (("payment_source_type" = ANY (ARRAY['card'::"text", 'relay_balance'::"text"]))),
    CONSTRAINT "order_payouts_payout_step_check" CHECK (("payout_step" = ANY (ARRAY['final_release'::"text", 'delivery_release'::"text", 'carrier_acceptance_release'::"text", 'delivery_balance_release'::"text", 'manual_override_release'::"text"]))),
    CONSTRAINT "order_payouts_reserve_withheld_cents_check" CHECK (("reserve_withheld_cents" >= 0)),
    CONSTRAINT "order_payouts_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'paid'::"text", 'frozen'::"text", 'failed'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "order_payouts_stripe_settlement_status_check" CHECK (("stripe_settlement_status" = ANY (ARRAY['not_applicable'::"text", 'pending'::"text", 'pending_settlement_unknown'::"text", 'settled'::"text"])))
);


ALTER TABLE "public"."order_payouts" OWNER TO "postgres";


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
    "listing_used_item_id" "uuid",
    "purchased_condition_photo_url" "text",
    "relay_tag_required" boolean DEFAULT true NOT NULL,
    "checkcheck_required" boolean DEFAULT true NOT NULL,
    "checkcheck_reason" "text",
    "checkcheck_status" "text" DEFAULT 'required'::"text" NOT NULL,
    "random_audit_required" boolean DEFAULT false NOT NULL,
    "high_risk_sku_required" boolean DEFAULT false NOT NULL,
    "seller_funds_frozen" boolean DEFAULT false NOT NULL,
    "relay_tag_id" "uuid",
    "auth_requirements_evaluated_at" timestamp with time zone,
    "random_audit_rate_bps_snapshot" integer,
    "high_risk_sku_id" "uuid",
    "high_risk_sku_reason" "text",
    "checkcheck_reviewed_at" timestamp with time zone,
    "checkcheck_reviewed_by_admin_id" "uuid",
    "checkcheck_admin_notes" "text",
    "seller_tier_snapshot" "text",
    "payout_schedule" "text",
    "reserve_percentage_bps_snapshot" integer,
    "reserve_hold_duration_days_snapshot" integer,
    "minimum_reserve_balance_cents_snapshot" bigint,
    "payout_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "payout_frozen_at" timestamp with time zone,
    "payout_frozen_reason" "text",
    "payout_last_trigger" "text",
    "payout_last_processed_at" timestamp with time zone,
    "payout_last_error" "text",
    "seller_amount_paid_cents" bigint DEFAULT 0 NOT NULL,
    "seller_amount_held_in_reserve_cents" bigint DEFAULT 0 NOT NULL,
    "seller_amount_frozen_cents" bigint DEFAULT 0 NOT NULL,
    "seller_amount_refunded_cents" bigint DEFAULT 0 NOT NULL,
    "dispute_admin_exception_until" timestamp with time zone,
    "dispute_admin_exception_reason" "text",
    "stripe_checkout_session_id" "text",
    "buyer_challenge_code" "text",
    "seller_proceeds_cents" bigint,
    "relay_fee_cents" bigint,
    "stripe_fee_estimate_cents" bigint,
    "balance_credit_status" "text" DEFAULT 'not_started'::"text" NOT NULL,
    "review_window_ends_at" timestamp with time zone,
    "funds_available_at" timestamp with time zone,
    "payment_funding_source" "text" DEFAULT 'card'::"text",
    "stripe_charge_id" "text",
    "stripe_balance_transaction_id" "text",
    "stripe_funds_available_on" timestamp with time zone,
    "stripe_funds_settled_at" timestamp with time zone,
    "stripe_settlement_status" "text" DEFAULT 'pending'::"text",
    "relay_balance_payment_idempotency_key" "text",
    CONSTRAINT "orders_balance_credit_status_check" CHECK (("balance_credit_status" = ANY (ARRAY['not_started'::"text", 'pending'::"text", 'available'::"text", 'failed'::"text", 'reversed'::"text"]))),
    CONSTRAINT "orders_checkcheck_status_check" CHECK (("checkcheck_status" = ANY (ARRAY['not_required'::"text", 'required'::"text", 'submitted'::"text", 'approved'::"text", 'rejected'::"text", 'admin_review'::"text"]))),
    CONSTRAINT "orders_minimum_reserve_balance_cents_snapshot_check" CHECK ((("minimum_reserve_balance_cents_snapshot" IS NULL) OR ("minimum_reserve_balance_cents_snapshot" >= 0))),
    CONSTRAINT "orders_payment_funding_source_check" CHECK (("payment_funding_source" = ANY (ARRAY['card'::"text", 'relay_balance'::"text"]))),
    CONSTRAINT "orders_payout_schedule_check" CHECK (("payout_schedule" = ANY (ARRAY['buyer_confirmation_or_review_expiry'::"text", 'delivery'::"text", 'carrier_acceptance_and_delivery_split'::"text"]))),
    CONSTRAINT "orders_payout_status_check" CHECK (("payout_status" = ANY (ARRAY['pending'::"text", 'partially_paid'::"text", 'paid'::"text", 'frozen'::"text", 'refunded'::"text", 'failed'::"text"]))),
    CONSTRAINT "orders_random_audit_rate_bps_snapshot_check" CHECK ((("random_audit_rate_bps_snapshot" IS NULL) OR (("random_audit_rate_bps_snapshot" >= 0) AND ("random_audit_rate_bps_snapshot" <= 10000)))),
    CONSTRAINT "orders_relay_fee_cents_check" CHECK ((("relay_fee_cents" IS NULL) OR ("relay_fee_cents" >= 0))),
    CONSTRAINT "orders_reserve_hold_duration_days_snapshot_check" CHECK ((("reserve_hold_duration_days_snapshot" IS NULL) OR ("reserve_hold_duration_days_snapshot" >= 0))),
    CONSTRAINT "orders_reserve_percentage_bps_snapshot_check" CHECK ((("reserve_percentage_bps_snapshot" IS NULL) OR (("reserve_percentage_bps_snapshot" >= 0) AND ("reserve_percentage_bps_snapshot" <= 10000)))),
    CONSTRAINT "orders_return_status_check" CHECK ((("return_status" IS NULL) OR ("return_status" = ANY (ARRAY['pending'::"text", 'shipped'::"text", 'delivered'::"text"])))),
    CONSTRAINT "orders_review_rating_check" CHECK ((("review_rating" IS NULL) OR (("review_rating" >= 1) AND ("review_rating" <= 5)))),
    CONSTRAINT "orders_seller_amount_frozen_cents_check" CHECK (("seller_amount_frozen_cents" >= 0)),
    CONSTRAINT "orders_seller_amount_held_in_reserve_cents_check" CHECK (("seller_amount_held_in_reserve_cents" >= 0)),
    CONSTRAINT "orders_seller_amount_paid_cents_check" CHECK (("seller_amount_paid_cents" >= 0)),
    CONSTRAINT "orders_seller_amount_refunded_cents_check" CHECK (("seller_amount_refunded_cents" >= 0)),
    CONSTRAINT "orders_seller_proceeds_cents_check" CHECK ((("seller_proceeds_cents" IS NULL) OR ("seller_proceeds_cents" >= 0))),
    CONSTRAINT "orders_seller_tier_snapshot_check" CHECK (("seller_tier_snapshot" = ANY (ARRAY['tier_1'::"text", 'tier_2'::"text", 'tier_3'::"text"]))),
    CONSTRAINT "orders_single_inventory_target_check" CHECK (("num_nonnulls"("listing_variant_id", "listing_used_item_id") <= 1)),
    CONSTRAINT "orders_status_check" CHECK (("status" = ANY (ARRAY['pending_payment'::"text", 'paid'::"text", 'auth_submitted'::"text", 'label_created'::"text", 'shipped'::"text", 'delivered'::"text", 'review_window'::"text", 'completed'::"text", 'disputed'::"text", 'cancelled'::"text", 'refund_pending'::"text", 'refunded'::"text", 'payout_failed'::"text", 'return_pending'::"text", 'return_shipped'::"text", 'return_delivered'::"text"]))),
    CONSTRAINT "orders_stripe_fee_estimate_cents_check" CHECK ((("stripe_fee_estimate_cents" IS NULL) OR ("stripe_fee_estimate_cents" >= 0))),
    CONSTRAINT "orders_stripe_settlement_status_check" CHECK (("stripe_settlement_status" = ANY (ARRAY['not_applicable'::"text", 'pending'::"text", 'pending_settlement_unknown'::"text", 'settled'::"text"])))
);


ALTER TABLE "public"."orders" OWNER TO "postgres";


COMMENT ON COLUMN "public"."orders"."buyer_challenge_code" IS 'Challenge code for buyer mobile verification flow, generated at delivery confirmation';



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
    "seller_tier" "text" DEFAULT 'tier_1'::"text" NOT NULL,
    "trust_score" integer DEFAULT 0 NOT NULL,
    "completed_order_count" integer DEFAULT 0 NOT NULL,
    "lifetime_gmv_cents" bigint DEFAULT 0 NOT NULL,
    "trailing_30d_order_count" integer DEFAULT 0 NOT NULL,
    "trailing_30d_dispute_count" integer DEFAULT 0 NOT NULL,
    "trailing_90d_order_count" integer DEFAULT 0 NOT NULL,
    "trailing_90d_dispute_count" integer DEFAULT 0 NOT NULL,
    "trailing_180d_order_count" integer DEFAULT 0 NOT NULL,
    "trailing_180d_dispute_count" integer DEFAULT 0 NOT NULL,
    "buyer_completion_completed_count" integer DEFAULT 0 NOT NULL,
    "buyer_completion_eligible_order_count" integer DEFAULT 0 NOT NULL,
    "buyer_completion_rate_bps" integer DEFAULT 10000 NOT NULL,
    "seller_approved_at" timestamp with time zone,
    "first_completed_order_at" timestamp with time zone,
    "authenticity_violation_count" integer DEFAULT 0 NOT NULL,
    "last_authenticity_violation_at" timestamp with time zone,
    "tier_manually_overridden" boolean DEFAULT false NOT NULL,
    "tier_manually_overridden_by" "uuid",
    "tier_override_reason" "text",
    "tier_last_evaluated_at" timestamp with time zone,
    "recommended_seller_tier" "text" DEFAULT 'tier_1'::"text" NOT NULL,
    "recommended_trust_score" integer DEFAULT 0 NOT NULL,
    "tier_locked" boolean DEFAULT false NOT NULL,
    "tier_locked_at" timestamp with time zone,
    "is_founding_seller" boolean DEFAULT false NOT NULL,
    "tier_3_approved_at" timestamp with time zone,
    "tier_3_approved_by" "uuid",
    "stripe_connect_onboarding_complete" boolean DEFAULT false NOT NULL,
    "stripe_identity_verification_status" "text" DEFAULT 'unverified'::"text" NOT NULL,
    "seller_identity_review_required" boolean DEFAULT false NOT NULL,
    "seller_identity_review_reason" "text",
    "stripe_payouts_enabled" boolean,
    "stripe_charges_enabled" boolean,
    "stripe_transfers_capability_status" "text" DEFAULT 'unknown'::"text" NOT NULL,
    "onboarding_stripe_only" boolean DEFAULT false NOT NULL,
    CONSTRAINT "profiles_buyer_completion_rate_bps_check" CHECK ((("buyer_completion_rate_bps" >= 0) AND ("buyer_completion_rate_bps" <= 10000))),
    CONSTRAINT "profiles_recommended_seller_tier_check" CHECK (("recommended_seller_tier" = ANY (ARRAY['tier_1'::"text", 'tier_2'::"text", 'tier_3'::"text"]))),
    CONSTRAINT "profiles_recommended_trust_score_check" CHECK ((("recommended_trust_score" >= 0) AND ("recommended_trust_score" <= 100))),
    CONSTRAINT "profiles_role_check" CHECK (("role" = ANY (ARRAY['buyer'::"text", 'seller'::"text", 'admin'::"text"]))),
    CONSTRAINT "profiles_seller_application_status_check" CHECK (("seller_application_status" = ANY (ARRAY['none'::"text", 'pending'::"text", 'approved'::"text", 'rejected'::"text", 'rejected_final'::"text"]))),
    CONSTRAINT "profiles_seller_tier_check" CHECK (("seller_tier" = ANY (ARRAY['tier_1'::"text", 'tier_2'::"text", 'tier_3'::"text"]))),
    CONSTRAINT "profiles_stripe_identity_verification_status_check" CHECK (("stripe_identity_verification_status" = ANY (ARRAY['unverified'::"text", 'pending'::"text", 'verified'::"text", 'restricted'::"text", 'review_required'::"text"]))),
    CONSTRAINT "profiles_stripe_transfers_capability_status_check" CHECK (("stripe_transfers_capability_status" = ANY (ARRAY['active'::"text", 'inactive'::"text", 'pending'::"text", 'unrequested'::"text", 'unknown'::"text"]))),
    CONSTRAINT "profiles_trust_score_check" CHECK ((("trust_score" >= 0) AND ("trust_score" <= 100)))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON COLUMN "public"."profiles"."onboarding_stripe_only" IS 'Admin-provisioned founding sellers who skip application/questionnaire and only need Stripe Connect on first login.';



CREATE TABLE IF NOT EXISTS "public"."relay_audit_events" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "actor_user_id" "uuid",
    "actor_role" "text" NOT NULL,
    "event_type" "text" NOT NULL,
    "order_id" "uuid",
    "seller_id" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "relay_audit_events_actor_role_check" CHECK (("actor_role" = ANY (ARRAY['system'::"text", 'admin'::"text", 'seller'::"text", 'buyer'::"text"])))
);


ALTER TABLE "public"."relay_audit_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."relay_balance_ledger" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "seller_id" "uuid" NOT NULL,
    "order_id" "uuid",
    "type" "text" NOT NULL,
    "amount_cents" bigint NOT NULL,
    "currency" "text" DEFAULT 'usd'::"text" NOT NULL,
    "status" "text" DEFAULT 'posted'::"text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "relay_balance_ledger_amount_cents_check" CHECK (("amount_cents" <> 0)),
    CONSTRAINT "relay_balance_ledger_amount_direction_check" CHECK (
CASE
    WHEN ("type" = ANY (ARRAY['order_pending_credit'::"text", 'order_available_credit'::"text", 'withdrawal_completed'::"text", 'withdrawal_failed'::"text", 'exposure_hold_created'::"text", 'exposure_hold_released'::"text", 'dispute_freeze'::"text"])) THEN ("amount_cents" > 0)
    WHEN ("type" = ANY (ARRAY['relay_balance_purchase_debit'::"text", 'withdrawal_requested'::"text", 'dispute_debit'::"text"])) THEN ("amount_cents" < 0)
    ELSE ("amount_cents" <> 0)
END),
    CONSTRAINT "relay_balance_ledger_currency_check" CHECK (("currency" = "lower"("currency"))),
    CONSTRAINT "relay_balance_ledger_order_required_check" CHECK (
CASE
    WHEN ("type" = ANY (ARRAY['order_pending_credit'::"text", 'order_available_credit'::"text", 'relay_balance_purchase_debit'::"text", 'exposure_hold_created'::"text", 'exposure_hold_released'::"text", 'dispute_freeze'::"text", 'dispute_debit'::"text"])) THEN ("order_id" IS NOT NULL)
    ELSE true
END),
    CONSTRAINT "relay_balance_ledger_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'posted'::"text", 'completed'::"text", 'failed'::"text", 'canceled'::"text"]))),
    CONSTRAINT "relay_balance_ledger_type_check" CHECK (("type" = ANY (ARRAY['order_pending_credit'::"text", 'order_available_credit'::"text", 'relay_balance_purchase_debit'::"text", 'withdrawal_requested'::"text", 'withdrawal_completed'::"text", 'withdrawal_failed'::"text", 'exposure_hold_created'::"text", 'exposure_hold_released'::"text", 'dispute_freeze'::"text", 'dispute_debit'::"text", 'admin_adjustment'::"text"])))
);


ALTER TABLE "public"."relay_balance_ledger" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."relay_balances" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "seller_id" "uuid" NOT NULL,
    "total_balance_cents" bigint DEFAULT 0 NOT NULL,
    "available_balance_cents" bigint DEFAULT 0 NOT NULL,
    "pending_balance_cents" bigint DEFAULT 0 NOT NULL,
    "exposure_cents" bigint DEFAULT 0 NOT NULL,
    "withdrawable_balance_cents" bigint DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "admin_frozen" boolean DEFAULT false NOT NULL,
    "frozen_reason" "text",
    "frozen_at" timestamp with time zone,
    "frozen_by_admin_id" "uuid",
    CONSTRAINT "relay_balances_exposure_cents_check" CHECK (("exposure_cents" >= 0)),
    CONSTRAINT "relay_balances_frozen_reason_check" CHECK (
CASE
    WHEN "admin_frozen" THEN (("frozen_reason" IS NOT NULL) AND ("length"(TRIM(BOTH FROM "frozen_reason")) > 0))
    ELSE true
END),
    CONSTRAINT "relay_balances_pending_balance_cents_check" CHECK (("pending_balance_cents" >= 0)),
    CONSTRAINT "relay_balances_total_consistency_check" CHECK (("total_balance_cents" = ("available_balance_cents" + "pending_balance_cents"))),
    CONSTRAINT "relay_balances_withdrawable_balance_cents_check" CHECK (("withdrawable_balance_cents" >= 0)),
    CONSTRAINT "relay_balances_withdrawable_consistency_check" CHECK (("withdrawable_balance_cents" <=
CASE
    WHEN ("available_balance_cents" > 0) THEN "available_balance_cents"
    ELSE (0)::bigint
END))
);


ALTER TABLE "public"."relay_balances" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."relay_tag_scan_events" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "relay_tag_id" "uuid" NOT NULL,
    "order_id" "uuid",
    "seller_id" "uuid",
    "actor_user_id" "uuid",
    "actor_role" "text" NOT NULL,
    "scan_type" "text" NOT NULL,
    "scanned_value" "text" NOT NULL,
    "scanned_barcode_value" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "relay_tag_scan_events_actor_role_check" CHECK (("actor_role" = ANY (ARRAY['system'::"text", 'admin'::"text", 'seller'::"text", 'buyer'::"text"])))
);


ALTER TABLE "public"."relay_tag_scan_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."relay_tags" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "tag_serial_number" "text" NOT NULL,
    "barcode_value" "text",
    "assigned_seller_id" "uuid",
    "assigned_order_id" "uuid",
    "status" "text" DEFAULT 'unassigned'::"text" NOT NULL,
    "assigned_to_seller_at" timestamp with time zone,
    "bound_to_order_at" timestamp with time zone,
    "submitted_by_seller_at" timestamp with time zone,
    "shipped_at" timestamp with time zone,
    "buyer_scanned_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "disputed_at" timestamp with time zone,
    "voided_at" timestamp with time zone,
    "photo_verification_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "admin_notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "assigned_by_admin_id" "uuid",
    "voided_by_admin_id" "uuid",
    "void_reason" "text",
    "source_batch_label" "text",
    "imported_at" timestamp with time zone,
    CONSTRAINT "relay_tags_photo_verification_status_check" CHECK (("photo_verification_status" = ANY (ARRAY['pending'::"text", 'verified'::"text", 'mismatch'::"text", 'admin_review'::"text"]))),
    CONSTRAINT "relay_tags_status_check" CHECK (("status" = ANY (ARRAY['unassigned'::"text", 'assigned_to_seller'::"text", 'bound_to_order'::"text", 'submitted_by_seller'::"text", 'shipped'::"text", 'buyer_scanned'::"text", 'completed'::"text", 'disputed'::"text", 'voided'::"text"])))
);


ALTER TABLE "public"."relay_tags" OWNER TO "postgres";


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


CREATE TABLE IF NOT EXISTS "public"."seller_api_keys" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "seller_id" "uuid" NOT NULL,
    "key_hash" "text" NOT NULL,
    "key_prefix" "text" NOT NULL,
    "name" "text" NOT NULL,
    "last_used_at" timestamp with time zone,
    "revoked_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."seller_api_keys" OWNER TO "postgres";


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


CREATE TABLE IF NOT EXISTS "public"."seller_identity_profiles" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "seller_id" "uuid" NOT NULL,
    "identity_fingerprint" "text",
    "phone_fingerprint" "text",
    "email_fingerprint" "text",
    "bank_account_fingerprint" "text",
    "country_code" "text",
    "stripe_account_id" "text",
    "verification_status" "text" DEFAULT 'unverified'::"text" NOT NULL,
    "stripe_connect_onboarding_complete" boolean DEFAULT false NOT NULL,
    "matched_banned_identity" boolean DEFAULT false NOT NULL,
    "matched_banned_identity_id" "uuid",
    "match_reasons" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "admin_review_required" boolean DEFAULT false NOT NULL,
    "false_positive_cleared" boolean DEFAULT false NOT NULL,
    "false_positive_cleared_at" timestamp with time zone,
    "false_positive_cleared_by_admin_id" "uuid",
    "banned_identity" boolean DEFAULT false NOT NULL,
    "banned_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "stripe_payouts_enabled" boolean,
    "stripe_charges_enabled" boolean,
    "stripe_transfers_capability_status" "text" DEFAULT 'unknown'::"text" NOT NULL,
    CONSTRAINT "seller_identity_profiles_stripe_transfers_capability_status_che" CHECK (("stripe_transfers_capability_status" = ANY (ARRAY['active'::"text", 'inactive'::"text", 'pending'::"text", 'unrequested'::"text", 'unknown'::"text"]))),
    CONSTRAINT "seller_identity_profiles_verification_status_check" CHECK (("verification_status" = ANY (ARRAY['unverified'::"text", 'pending'::"text", 'verified'::"text", 'restricted'::"text", 'review_required'::"text"])))
);


ALTER TABLE "public"."seller_identity_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."seller_reserve_accounts" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "seller_id" "uuid" NOT NULL,
    "balance_cents" bigint DEFAULT 0 NOT NULL,
    "minimum_balance_cents" bigint DEFAULT 0 NOT NULL,
    "reserve_percentage_bps" integer DEFAULT 1500 NOT NULL,
    "hold_duration_days" integer,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "seller_reserve_accounts_balance_cents_check" CHECK (("balance_cents" >= 0)),
    CONSTRAINT "seller_reserve_accounts_hold_duration_days_check" CHECK ((("hold_duration_days" IS NULL) OR ("hold_duration_days" >= 0))),
    CONSTRAINT "seller_reserve_accounts_minimum_balance_cents_check" CHECK (("minimum_balance_cents" >= 0)),
    CONSTRAINT "seller_reserve_accounts_reserve_percentage_bps_check" CHECK ((("reserve_percentage_bps" >= 0) AND ("reserve_percentage_bps" <= 10000)))
);


ALTER TABLE "public"."seller_reserve_accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."seller_reserve_entries" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "seller_id" "uuid" NOT NULL,
    "order_id" "uuid",
    "entry_type" "text" NOT NULL,
    "amount_cents" bigint NOT NULL,
    "reserve_percentage_bps" integer DEFAULT 0 NOT NULL,
    "hold_duration_days" integer,
    "release_eligible_at" timestamp with time zone,
    "released_at" timestamp with time zone,
    "consumed_at" timestamp with time zone,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "description" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "order_payout_id" "uuid",
    "is_frozen" boolean DEFAULT false NOT NULL,
    "frozen_at" timestamp with time zone,
    "freeze_reason" "text",
    CONSTRAINT "seller_reserve_entries_amount_cents_check" CHECK (("amount_cents" >= 0)),
    CONSTRAINT "seller_reserve_entries_entry_type_check" CHECK (("entry_type" = ANY (ARRAY['hold'::"text", 'release'::"text", 'consume'::"text", 'adjustment'::"text", 'minimum_balance_seed'::"text"]))),
    CONSTRAINT "seller_reserve_entries_hold_duration_days_check" CHECK ((("hold_duration_days" IS NULL) OR ("hold_duration_days" >= 0))),
    CONSTRAINT "seller_reserve_entries_reserve_percentage_bps_check" CHECK ((("reserve_percentage_bps" >= 0) AND ("reserve_percentage_bps" <= 10000))),
    CONSTRAINT "seller_reserve_entries_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'held'::"text", 'released'::"text", 'consumed'::"text"])))
);


ALTER TABLE "public"."seller_reserve_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."seller_tag_requests" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "seller_id" "uuid" NOT NULL,
    "requested_quantity" integer NOT NULL,
    "seller_tier_snapshot" "text" NOT NULL,
    "policy_type" "text" NOT NULL,
    "request_reason" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "admin_notes" "text",
    "reviewed_by_admin_id" "uuid",
    "reviewed_at" timestamp with time zone,
    "fulfilled_at" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "seller_tag_requests_policy_type_check" CHECK (("policy_type" = ANY (ARRAY['welcome'::"text", 'additional_request'::"text", 'bundle_250'::"text", 'monthly_replenishment'::"text"]))),
    CONSTRAINT "seller_tag_requests_requested_quantity_check" CHECK (("requested_quantity" > 0)),
    CONSTRAINT "seller_tag_requests_seller_tier_snapshot_check" CHECK (("seller_tier_snapshot" = ANY (ARRAY['tier_1'::"text", 'tier_2'::"text", 'tier_3'::"text"]))),
    CONSTRAINT "seller_tag_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'fulfilled'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."seller_tag_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."seller_tier_history" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "seller_id" "uuid" NOT NULL,
    "previous_tier" "text",
    "new_tier" "text" NOT NULL,
    "recommended_tier" "text",
    "trust_score" integer,
    "change_source" "text" NOT NULL,
    "actor_user_id" "uuid",
    "reason" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "seller_tier_history_change_source_check" CHECK (("change_source" = ANY (ARRAY['automated_evaluation'::"text", 'manual_override'::"text", 'manual_unlock'::"text", 'admin_approval'::"text", 'authenticity_violation'::"text", 'tag_tampering_violation'::"text", 'dispute_rate_demotion'::"text"]))),
    CONSTRAINT "seller_tier_history_new_tier_check" CHECK (("new_tier" = ANY (ARRAY['tier_1'::"text", 'tier_2'::"text", 'tier_3'::"text"]))),
    CONSTRAINT "seller_tier_history_previous_tier_check" CHECK ((("previous_tier" IS NULL) OR ("previous_tier" = ANY (ARRAY['tier_1'::"text", 'tier_2'::"text", 'tier_3'::"text"])))),
    CONSTRAINT "seller_tier_history_recommended_tier_check" CHECK ((("recommended_tier" IS NULL) OR ("recommended_tier" = ANY (ARRAY['tier_1'::"text", 'tier_2'::"text", 'tier_3'::"text"])))),
    CONSTRAINT "seller_tier_history_trust_score_check" CHECK ((("trust_score" IS NULL) OR (("trust_score" >= 0) AND ("trust_score" <= 100))))
);


ALTER TABLE "public"."seller_tier_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."seller_trust_evaluations" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "seller_id" "uuid" NOT NULL,
    "trust_score" integer NOT NULL,
    "recommended_tier" "text" NOT NULL,
    "applied_tier" "text" NOT NULL,
    "was_tier_changed" boolean DEFAULT false NOT NULL,
    "manual_override_applied" boolean DEFAULT false NOT NULL,
    "admin_approval_required" boolean DEFAULT false NOT NULL,
    "breakdown" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "reasons" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "hard_thresholds" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "evaluated_by_user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "seller_trust_evaluations_applied_tier_check" CHECK (("applied_tier" = ANY (ARRAY['tier_1'::"text", 'tier_2'::"text", 'tier_3'::"text"]))),
    CONSTRAINT "seller_trust_evaluations_recommended_tier_check" CHECK (("recommended_tier" = ANY (ARRAY['tier_1'::"text", 'tier_2'::"text", 'tier_3'::"text"]))),
    CONSTRAINT "seller_trust_evaluations_trust_score_check" CHECK ((("trust_score" >= 0) AND ("trust_score" <= 100)))
);


ALTER TABLE "public"."seller_trust_evaluations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."seller_violations" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "seller_id" "uuid" NOT NULL,
    "order_id" "uuid",
    "violation_type" "text" NOT NULL,
    "severity" "text" DEFAULT 'high'::"text" NOT NULL,
    "penalty_outcome" "text",
    "notes" "text",
    "actor_user_id" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "seller_violations_severity_check" CHECK (("severity" = ANY (ARRAY['low'::"text", 'medium'::"text", 'high'::"text", 'critical'::"text"]))),
    CONSTRAINT "seller_violations_violation_type_check" CHECK (("violation_type" = ANY (ARRAY['authenticity'::"text", 'tag_tampering'::"text", 'dispute_rate'::"text", 'manual_demotion'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."seller_violations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."site_settings" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "onboarding_active" boolean DEFAULT true NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "tier_3_random_audit_rate_bps" integer DEFAULT 500 NOT NULL,
    CONSTRAINT "site_settings_tier_3_random_audit_rate_bps_check" CHECK ((("tier_3_random_audit_rate_bps" >= 0) AND ("tier_3_random_audit_rate_bps" <= 10000)))
);


ALTER TABLE "public"."site_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sneakers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sku" "text" NOT NULL,
    "normalized_sku" "text" NOT NULL,
    "brand" "text",
    "name" "text" NOT NULL,
    "model" "text",
    "nickname" "text",
    "colorway" "text",
    "gender" "text",
    "release_date" "date",
    "retail_price" numeric,
    "image_url" "text",
    "source" "text" DEFAULT 'kicksdb'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "description" "text",
    "gallery_images" "text"[] DEFAULT '{}'::"text"[]
);


ALTER TABLE "public"."sneakers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tag_orders" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "seller_id" "uuid" NOT NULL,
    "bundle_id" "text" NOT NULL,
    "bundle_name" "text" NOT NULL,
    "quantity" integer NOT NULL,
    "price_cents" integer NOT NULL,
    "status" "text" DEFAULT 'paid'::"text" NOT NULL,
    "stripe_checkout_session_id" "text",
    "stripe_payment_intent_id" "text",
    "shipping_tracking_number" "text",
    "shipping_carrier" "text",
    "admin_notes" "text",
    "paid_at" timestamp with time zone,
    "shipped_at" timestamp with time zone,
    "fulfilled_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "shipping_label_url" "text",
    "shippo_transaction_id" "text",
    "shippo_shipment_id" "text",
    "shippo_rate_id" "text",
    CONSTRAINT "tag_orders_price_cents_check" CHECK (("price_cents" >= 0)),
    CONSTRAINT "tag_orders_quantity_check" CHECK (("quantity" > 0)),
    CONSTRAINT "tag_orders_status_check" CHECK (("status" = ANY (ARRAY['paid'::"text", 'processing'::"text", 'shipped'::"text", 'fulfilled'::"text"])))
);


ALTER TABLE "public"."tag_orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."withdrawal_requests" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "seller_id" "uuid" NOT NULL,
    "amount_cents" bigint NOT NULL,
    "stripe_transfer_id" "text",
    "stripe_transfer_fee_cents" bigint DEFAULT 25 NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "failure_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "idempotency_key" "text",
    "review_required" boolean DEFAULT false NOT NULL,
    "reviewed_at" timestamp with time zone,
    "reviewed_by_admin_id" "uuid",
    "review_notes" "text",
    "canceled_at" timestamp with time zone,
    "canceled_by_admin_id" "uuid",
    CONSTRAINT "withdrawal_requests_amount_cents_check" CHECK (("amount_cents" > 0)),
    CONSTRAINT "withdrawal_requests_completed_at_check" CHECK (
CASE
    WHEN ("status" = 'completed'::"text") THEN ("completed_at" IS NOT NULL)
    ELSE true
END),
    CONSTRAINT "withdrawal_requests_review_required_status_check" CHECK (
CASE
    WHEN "review_required" THEN ("status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'completed'::"text", 'failed'::"text", 'canceled'::"text"]))
    ELSE true
END),
    CONSTRAINT "withdrawal_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'completed'::"text", 'failed'::"text", 'canceled'::"text"]))),
    CONSTRAINT "withdrawal_requests_stripe_transfer_fee_cents_check" CHECK (("stripe_transfer_fee_cents" >= 0))
);


ALTER TABLE "public"."withdrawal_requests" OWNER TO "postgres";


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



ALTER TABLE ONLY "public"."exposure_holds"
    ADD CONSTRAINT "exposure_holds_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."follows"
    ADD CONSTRAINT "follows_follower_id_following_id_key" UNIQUE ("follower_id", "following_id");



ALTER TABLE ONLY "public"."follows"
    ADD CONSTRAINT "follows_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."high_risk_skus"
    ADD CONSTRAINT "high_risk_skus_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."high_risk_skus"
    ADD CONSTRAINT "high_risk_skus_sku_normalized_key" UNIQUE ("sku_normalized");



ALTER TABLE ONLY "public"."integration_api_logs"
    ADD CONSTRAINT "integration_api_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."listing_used_items"
    ADD CONSTRAINT "listing_used_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."listing_variants"
    ADD CONSTRAINT "listing_variants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."listings"
    ADD CONSTRAINT "listings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_chain_of_custody"
    ADD CONSTRAINT "order_chain_of_custody_pkey" PRIMARY KEY ("order_id");



ALTER TABLE ONLY "public"."order_disputes"
    ADD CONSTRAINT "order_disputes_order_id_key" UNIQUE ("order_id");



ALTER TABLE ONLY "public"."order_disputes"
    ADD CONSTRAINT "order_disputes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_payouts"
    ADD CONSTRAINT "order_payouts_idempotency_key_key" UNIQUE ("idempotency_key");



ALTER TABLE ONLY "public"."order_payouts"
    ADD CONSTRAINT "order_payouts_order_step_unique" UNIQUE ("order_id", "payout_step");



ALTER TABLE ONLY "public"."order_payouts"
    ADD CONSTRAINT "order_payouts_pkey" PRIMARY KEY ("id");



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



ALTER TABLE ONLY "public"."relay_audit_events"
    ADD CONSTRAINT "relay_audit_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."relay_balance_ledger"
    ADD CONSTRAINT "relay_balance_ledger_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."relay_balances"
    ADD CONSTRAINT "relay_balances_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."relay_balances"
    ADD CONSTRAINT "relay_balances_seller_id_key" UNIQUE ("seller_id");



ALTER TABLE ONLY "public"."relay_tag_scan_events"
    ADD CONSTRAINT "relay_tag_scan_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."relay_tags"
    ADD CONSTRAINT "relay_tags_barcode_value_key" UNIQUE ("barcode_value");



ALTER TABLE ONLY "public"."relay_tags"
    ADD CONSTRAINT "relay_tags_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."relay_tags"
    ADD CONSTRAINT "relay_tags_tag_serial_number_key" UNIQUE ("tag_serial_number");



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_order_id_key" UNIQUE ("order_id");



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."seller_api_keys"
    ADD CONSTRAINT "seller_api_keys_key_hash_key" UNIQUE ("key_hash");



ALTER TABLE ONLY "public"."seller_api_keys"
    ADD CONSTRAINT "seller_api_keys_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."seller_applications"
    ADD CONSTRAINT "seller_applications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."seller_identity_profiles"
    ADD CONSTRAINT "seller_identity_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."seller_identity_profiles"
    ADD CONSTRAINT "seller_identity_profiles_seller_id_key" UNIQUE ("seller_id");



ALTER TABLE ONLY "public"."seller_reserve_accounts"
    ADD CONSTRAINT "seller_reserve_accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."seller_reserve_accounts"
    ADD CONSTRAINT "seller_reserve_accounts_seller_id_key" UNIQUE ("seller_id");



ALTER TABLE ONLY "public"."seller_reserve_entries"
    ADD CONSTRAINT "seller_reserve_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."seller_tag_requests"
    ADD CONSTRAINT "seller_tag_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."seller_tier_history"
    ADD CONSTRAINT "seller_tier_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."seller_trust_evaluations"
    ADD CONSTRAINT "seller_trust_evaluations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."seller_violations"
    ADD CONSTRAINT "seller_violations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."site_settings"
    ADD CONSTRAINT "site_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sneakers"
    ADD CONSTRAINT "sneakers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tag_orders"
    ADD CONSTRAINT "tag_orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."withdrawal_requests"
    ADD CONSTRAINT "withdrawal_requests_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_catalog_products_sku_normalized" ON "public"."catalog_products" USING "btree" ("sku_normalized");



CREATE INDEX "idx_conversation_reads_conversation_id" ON "public"."conversation_reads" USING "btree" ("conversation_id");



CREATE INDEX "idx_conversation_reads_user_id" ON "public"."conversation_reads" USING "btree" ("user_id");



CREATE INDEX "idx_conversations_created_at" ON "public"."conversations" USING "btree" ("created_at");



CREATE INDEX "idx_conversations_listing_id" ON "public"."conversations" USING "btree" ("listing_id");



CREATE INDEX "idx_conversations_participant_ids" ON "public"."conversations" USING "gin" ("participant_ids");



CREATE INDEX "idx_custom_offers_conversation_id" ON "public"."custom_offers" USING "btree" ("conversation_id");



CREATE INDEX "idx_custom_offers_listing_id" ON "public"."custom_offers" USING "btree" ("listing_id");



CREATE INDEX "idx_custom_offers_listing_used_item_id" ON "public"."custom_offers" USING "btree" ("listing_used_item_id");



CREATE INDEX "idx_custom_offers_listing_variant_id" ON "public"."custom_offers" USING "btree" ("listing_variant_id");



CREATE INDEX "idx_custom_offers_sender_id" ON "public"."custom_offers" USING "btree" ("sender_id");



CREATE INDEX "idx_custom_offers_status" ON "public"."custom_offers" USING "btree" ("status");



CREATE INDEX "idx_exposure_holds_created_at" ON "public"."exposure_holds" USING "btree" ("created_at");



CREATE UNIQUE INDEX "idx_exposure_holds_open_order_unique" ON "public"."exposure_holds" USING "btree" ("order_id") WHERE ("status" = ANY (ARRAY['active'::"text", 'disputed'::"text"]));



CREATE INDEX "idx_exposure_holds_order_id" ON "public"."exposure_holds" USING "btree" ("order_id");



CREATE INDEX "idx_exposure_holds_seller_id" ON "public"."exposure_holds" USING "btree" ("seller_id");



CREATE INDEX "idx_exposure_holds_status" ON "public"."exposure_holds" USING "btree" ("status");



CREATE INDEX "idx_follows_follower_id" ON "public"."follows" USING "btree" ("follower_id");



CREATE INDEX "idx_follows_following_id" ON "public"."follows" USING "btree" ("following_id");



CREATE INDEX "idx_high_risk_skus_is_active" ON "public"."high_risk_skus" USING "btree" ("is_active");



CREATE INDEX "idx_high_risk_skus_sku_normalized" ON "public"."high_risk_skus" USING "btree" ("sku_normalized");



CREATE INDEX "idx_integration_api_logs_api_key_id_created_at" ON "public"."integration_api_logs" USING "btree" ("api_key_id", "created_at" DESC);



CREATE INDEX "idx_integration_api_logs_created_at" ON "public"."integration_api_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_integration_api_logs_request_id" ON "public"."integration_api_logs" USING "btree" ("request_id");



CREATE INDEX "idx_integration_api_logs_seller_id_created_at" ON "public"."integration_api_logs" USING "btree" ("seller_id", "created_at" DESC);



CREATE INDEX "idx_listing_used_items_active" ON "public"."listing_used_items" USING "btree" ("listing_id", "is_active");



CREATE INDEX "idx_listing_used_items_listing_id" ON "public"."listing_used_items" USING "btree" ("listing_id");



CREATE UNIQUE INDEX "idx_listing_used_items_listing_photo_unique" ON "public"."listing_used_items" USING "btree" ("listing_id", "condition_photo_url");



CREATE INDEX "idx_listing_variants_active" ON "public"."listing_variants" USING "btree" ("listing_id", "is_active");



CREATE INDEX "idx_listing_variants_listing_id" ON "public"."listing_variants" USING "btree" ("listing_id");



CREATE UNIQUE INDEX "idx_listing_variants_listing_size_condition_unique" ON "public"."listing_variants" USING "btree" ("listing_id", "size", "condition");



CREATE INDEX "idx_listing_variants_needs_condition_photo" ON "public"."listing_variants" USING "btree" ("listing_id") WHERE ("needs_condition_photo" = true);



CREATE INDEX "idx_listings_brand" ON "public"."listings" USING "btree" ("brand");



CREATE INDEX "idx_listings_catalog_product_id" ON "public"."listings" USING "btree" ("catalog_product_id");



CREATE INDEX "idx_listings_created_at" ON "public"."listings" USING "btree" ("created_at");



CREATE INDEX "idx_listings_inventory_review_status" ON "public"."listings" USING "btree" ("inventory_review_status") WHERE ("inventory_review_status" IS NOT NULL);



CREATE INDEX "idx_listings_seller_id" ON "public"."listings" USING "btree" ("seller_id");



CREATE INDEX "idx_listings_seller_updated_at" ON "public"."listings" USING "btree" ("seller_id", "updated_at" DESC);



CREATE INDEX "idx_listings_sneaker_id" ON "public"."listings" USING "btree" ("sneaker_id");



CREATE INDEX "idx_listings_status" ON "public"."listings" USING "btree" ("status");



CREATE UNIQUE INDEX "idx_listings_unique_seller_sku" ON "public"."listings" USING "btree" ("seller_id", "sku_normalized") WHERE (("sku_normalized" IS NOT NULL) AND ("status" <> 'removed'::"text"));



CREATE INDEX "idx_messages_conversation_id" ON "public"."messages" USING "btree" ("conversation_id");



CREATE INDEX "idx_messages_created_at" ON "public"."messages" USING "btree" ("created_at");



CREATE INDEX "idx_messages_sender_id" ON "public"."messages" USING "btree" ("sender_id");



CREATE INDEX "idx_order_chain_of_custody_relay_tag_id" ON "public"."order_chain_of_custody" USING "btree" ("relay_tag_id");



CREATE INDEX "idx_order_chain_of_custody_verification_status" ON "public"."order_chain_of_custody" USING "btree" ("verification_status");



CREATE INDEX "idx_order_disputes_buyer_id" ON "public"."order_disputes" USING "btree" ("buyer_id");



CREATE INDEX "idx_order_disputes_category" ON "public"."order_disputes" USING "btree" ("category");



CREATE INDEX "idx_order_disputes_seller_id" ON "public"."order_disputes" USING "btree" ("seller_id");



CREATE INDEX "idx_order_disputes_status" ON "public"."order_disputes" USING "btree" ("status");



CREATE INDEX "idx_order_payouts_order_id" ON "public"."order_payouts" USING "btree" ("order_id");



CREATE INDEX "idx_order_payouts_paid_at" ON "public"."order_payouts" USING "btree" ("paid_at");



CREATE INDEX "idx_order_payouts_payment_source_type" ON "public"."order_payouts" USING "btree" ("payment_source_type");



CREATE INDEX "idx_order_payouts_seller_id" ON "public"."order_payouts" USING "btree" ("seller_id");



CREATE INDEX "idx_order_payouts_status" ON "public"."order_payouts" USING "btree" ("status");



CREATE INDEX "idx_order_payouts_stripe_settlement_status" ON "public"."order_payouts" USING "btree" ("stripe_settlement_status");



CREATE INDEX "idx_orders_auth_requirements_evaluated_at" ON "public"."orders" USING "btree" ("auth_requirements_evaluated_at");



CREATE INDEX "idx_orders_balance_credit_status" ON "public"."orders" USING "btree" ("balance_credit_status");



CREATE INDEX "idx_orders_buyer_id" ON "public"."orders" USING "btree" ("buyer_id");



CREATE INDEX "idx_orders_checkcheck_reviewed_by_admin_id" ON "public"."orders" USING "btree" ("checkcheck_reviewed_by_admin_id");



CREATE INDEX "idx_orders_checkcheck_status" ON "public"."orders" USING "btree" ("checkcheck_status");



CREATE INDEX "idx_orders_created_at" ON "public"."orders" USING "btree" ("created_at");



CREATE INDEX "idx_orders_custom_offer_id" ON "public"."orders" USING "btree" ("custom_offer_id");



CREATE INDEX "idx_orders_funds_available_at" ON "public"."orders" USING "btree" ("funds_available_at");



CREATE INDEX "idx_orders_high_risk_sku_id" ON "public"."orders" USING "btree" ("high_risk_sku_id");



CREATE INDEX "idx_orders_listing_id" ON "public"."orders" USING "btree" ("listing_id");



CREATE INDEX "idx_orders_listing_used_item_id" ON "public"."orders" USING "btree" ("listing_used_item_id");



CREATE INDEX "idx_orders_listing_variant_id" ON "public"."orders" USING "btree" ("listing_variant_id");



CREATE INDEX "idx_orders_payment_funding_source" ON "public"."orders" USING "btree" ("payment_funding_source");



CREATE UNIQUE INDEX "idx_orders_relay_balance_payment_idempotency_key" ON "public"."orders" USING "btree" ("relay_balance_payment_idempotency_key") WHERE ("relay_balance_payment_idempotency_key" IS NOT NULL);



CREATE INDEX "idx_orders_relay_tag_id" ON "public"."orders" USING "btree" ("relay_tag_id");



CREATE INDEX "idx_orders_review_window_ends_at" ON "public"."orders" USING "btree" ("review_window_ends_at");



CREATE INDEX "idx_orders_seller_funds_frozen" ON "public"."orders" USING "btree" ("seller_funds_frozen");



CREATE INDEX "idx_orders_seller_id" ON "public"."orders" USING "btree" ("seller_id");



CREATE INDEX "idx_orders_status" ON "public"."orders" USING "btree" ("status");



CREATE INDEX "idx_orders_stripe_checkout_session_id" ON "public"."orders" USING "btree" ("stripe_checkout_session_id");



CREATE INDEX "idx_orders_stripe_funds_available_on" ON "public"."orders" USING "btree" ("stripe_funds_available_on");



CREATE INDEX "idx_orders_stripe_settlement_status" ON "public"."orders" USING "btree" ("stripe_settlement_status");



CREATE UNIQUE INDEX "idx_orders_unique_stripe_checkout_session_id" ON "public"."orders" USING "btree" ("stripe_checkout_session_id") WHERE ("stripe_checkout_session_id" IS NOT NULL);



CREATE INDEX "idx_post_likes_post_id" ON "public"."post_likes" USING "btree" ("post_id");



CREATE INDEX "idx_post_likes_user_id" ON "public"."post_likes" USING "btree" ("user_id");



CREATE INDEX "idx_posts_created_at" ON "public"."posts" USING "btree" ("created_at");



CREATE INDEX "idx_posts_is_custom_brand" ON "public"."posts" USING "btree" ("is_custom_brand");



CREATE INDEX "idx_posts_is_rising_brand" ON "public"."posts" USING "btree" ("is_rising_brand");



CREATE INDEX "idx_posts_related_listing_id" ON "public"."posts" USING "btree" ("related_listing_id");



CREATE INDEX "idx_posts_seller_id" ON "public"."posts" USING "btree" ("seller_id");



CREATE INDEX "idx_profiles_email" ON "public"."profiles" USING "btree" ("email");



CREATE INDEX "idx_profiles_is_founding_seller" ON "public"."profiles" USING "btree" ("is_founding_seller");



CREATE INDEX "idx_profiles_is_founding_seller_launch" ON "public"."profiles" USING "btree" ("is_founding_seller");



CREATE INDEX "idx_profiles_onboarding_stripe_only" ON "public"."profiles" USING "btree" ("onboarding_stripe_only") WHERE ("onboarding_stripe_only" = true);



CREATE INDEX "idx_profiles_recommended_seller_tier" ON "public"."profiles" USING "btree" ("recommended_seller_tier");



CREATE INDEX "idx_profiles_role" ON "public"."profiles" USING "btree" ("role");



CREATE INDEX "idx_profiles_seller_identity_review_required" ON "public"."profiles" USING "btree" ("seller_identity_review_required");



CREATE INDEX "idx_profiles_seller_tier" ON "public"."profiles" USING "btree" ("seller_tier");



CREATE INDEX "idx_profiles_stripe_connect_onboarding_complete" ON "public"."profiles" USING "btree" ("stripe_connect_onboarding_complete");



CREATE INDEX "idx_profiles_tier_last_evaluated_at" ON "public"."profiles" USING "btree" ("tier_last_evaluated_at");



CREATE INDEX "idx_profiles_tier_locked" ON "public"."profiles" USING "btree" ("tier_locked");



CREATE INDEX "idx_profiles_username" ON "public"."profiles" USING "btree" ("username");



CREATE INDEX "idx_relay_audit_events_actor_user_id" ON "public"."relay_audit_events" USING "btree" ("actor_user_id");



CREATE INDEX "idx_relay_audit_events_created_at" ON "public"."relay_audit_events" USING "btree" ("created_at");



CREATE INDEX "idx_relay_audit_events_event_type" ON "public"."relay_audit_events" USING "btree" ("event_type");



CREATE INDEX "idx_relay_audit_events_order_id" ON "public"."relay_audit_events" USING "btree" ("order_id");



CREATE INDEX "idx_relay_audit_events_seller_id" ON "public"."relay_audit_events" USING "btree" ("seller_id");



CREATE INDEX "idx_relay_balance_ledger_created_at" ON "public"."relay_balance_ledger" USING "btree" ("created_at");



CREATE UNIQUE INDEX "idx_relay_balance_ledger_idempotency_key_unique" ON "public"."relay_balance_ledger" USING "btree" ("type", (("metadata" ->> 'idempotency_key'::"text"))) WHERE ("metadata" ? 'idempotency_key'::"text");



CREATE INDEX "idx_relay_balance_ledger_order_id" ON "public"."relay_balance_ledger" USING "btree" ("order_id");



CREATE UNIQUE INDEX "idx_relay_balance_ledger_order_pending_credit_unique" ON "public"."relay_balance_ledger" USING "btree" ("order_id", "type") WHERE (("order_id" IS NOT NULL) AND ("type" = 'order_pending_credit'::"text") AND ("status" = ANY (ARRAY['pending'::"text", 'posted'::"text", 'completed'::"text"])));



CREATE INDEX "idx_relay_balance_ledger_seller_id" ON "public"."relay_balance_ledger" USING "btree" ("seller_id");



CREATE INDEX "idx_relay_balance_ledger_status" ON "public"."relay_balance_ledger" USING "btree" ("status");



CREATE INDEX "idx_relay_balance_ledger_type" ON "public"."relay_balance_ledger" USING "btree" ("type");



CREATE INDEX "idx_relay_balances_admin_frozen" ON "public"."relay_balances" USING "btree" ("admin_frozen");



CREATE INDEX "idx_relay_balances_frozen_by_admin_id" ON "public"."relay_balances" USING "btree" ("frozen_by_admin_id");



CREATE INDEX "idx_relay_balances_seller_id" ON "public"."relay_balances" USING "btree" ("seller_id");



CREATE INDEX "idx_relay_tag_scan_events_actor_user_id" ON "public"."relay_tag_scan_events" USING "btree" ("actor_user_id");



CREATE INDEX "idx_relay_tag_scan_events_order_id" ON "public"."relay_tag_scan_events" USING "btree" ("order_id");



CREATE INDEX "idx_relay_tag_scan_events_relay_tag_id" ON "public"."relay_tag_scan_events" USING "btree" ("relay_tag_id");



CREATE INDEX "idx_relay_tag_scan_events_seller_id" ON "public"."relay_tag_scan_events" USING "btree" ("seller_id");



CREATE INDEX "idx_relay_tags_assigned_by_admin_id" ON "public"."relay_tags" USING "btree" ("assigned_by_admin_id");



CREATE INDEX "idx_relay_tags_assigned_order_id" ON "public"."relay_tags" USING "btree" ("assigned_order_id");



CREATE INDEX "idx_relay_tags_assigned_seller_id" ON "public"."relay_tags" USING "btree" ("assigned_seller_id");



CREATE INDEX "idx_relay_tags_source_batch_label" ON "public"."relay_tags" USING "btree" ("source_batch_label");



CREATE INDEX "idx_relay_tags_status" ON "public"."relay_tags" USING "btree" ("status");



CREATE UNIQUE INDEX "idx_relay_tags_unique_assigned_order" ON "public"."relay_tags" USING "btree" ("assigned_order_id") WHERE ("assigned_order_id" IS NOT NULL);



CREATE INDEX "idx_relay_tags_voided_by_admin_id" ON "public"."relay_tags" USING "btree" ("voided_by_admin_id");



CREATE INDEX "idx_reviews_order_id" ON "public"."reviews" USING "btree" ("order_id");



CREATE INDEX "idx_reviews_reviewer_id" ON "public"."reviews" USING "btree" ("reviewer_id");



CREATE INDEX "idx_reviews_seller_id" ON "public"."reviews" USING "btree" ("seller_id");



CREATE INDEX "idx_seller_api_keys_key_prefix" ON "public"."seller_api_keys" USING "btree" ("key_prefix");



CREATE INDEX "idx_seller_api_keys_seller_id" ON "public"."seller_api_keys" USING "btree" ("seller_id");



CREATE INDEX "idx_seller_api_keys_seller_id_revoked_at" ON "public"."seller_api_keys" USING "btree" ("seller_id", "revoked_at");



CREATE INDEX "idx_seller_applications_created_at" ON "public"."seller_applications" USING "btree" ("created_at");



CREATE INDEX "idx_seller_applications_status" ON "public"."seller_applications" USING "btree" ("status");



CREATE INDEX "idx_seller_applications_user_id" ON "public"."seller_applications" USING "btree" ("user_id");



CREATE INDEX "idx_seller_identity_profiles_admin_review_required" ON "public"."seller_identity_profiles" USING "btree" ("admin_review_required");



CREATE INDEX "idx_seller_identity_profiles_bank_account_fingerprint" ON "public"."seller_identity_profiles" USING "btree" ("bank_account_fingerprint") WHERE ("bank_account_fingerprint" IS NOT NULL);



CREATE INDEX "idx_seller_identity_profiles_banned_identity" ON "public"."seller_identity_profiles" USING "btree" ("banned_identity");



CREATE INDEX "idx_seller_identity_profiles_email_fingerprint" ON "public"."seller_identity_profiles" USING "btree" ("email_fingerprint") WHERE ("email_fingerprint" IS NOT NULL);



CREATE INDEX "idx_seller_identity_profiles_identity_fingerprint" ON "public"."seller_identity_profiles" USING "btree" ("identity_fingerprint") WHERE ("identity_fingerprint" IS NOT NULL);



CREATE INDEX "idx_seller_identity_profiles_matched_banned_identity" ON "public"."seller_identity_profiles" USING "btree" ("matched_banned_identity");



CREATE INDEX "idx_seller_identity_profiles_phone_fingerprint" ON "public"."seller_identity_profiles" USING "btree" ("phone_fingerprint") WHERE ("phone_fingerprint" IS NOT NULL);



CREATE INDEX "idx_seller_identity_profiles_seller_id" ON "public"."seller_identity_profiles" USING "btree" ("seller_id");



CREATE INDEX "idx_seller_identity_profiles_stripe_account_id" ON "public"."seller_identity_profiles" USING "btree" ("stripe_account_id") WHERE ("stripe_account_id" IS NOT NULL);



CREATE INDEX "idx_seller_reserve_accounts_seller_id" ON "public"."seller_reserve_accounts" USING "btree" ("seller_id");



CREATE INDEX "idx_seller_reserve_entries_is_frozen" ON "public"."seller_reserve_entries" USING "btree" ("is_frozen");



CREATE INDEX "idx_seller_reserve_entries_order_id" ON "public"."seller_reserve_entries" USING "btree" ("order_id");



CREATE INDEX "idx_seller_reserve_entries_order_payout_id" ON "public"."seller_reserve_entries" USING "btree" ("order_payout_id");



CREATE INDEX "idx_seller_reserve_entries_release_eligible_at" ON "public"."seller_reserve_entries" USING "btree" ("release_eligible_at");



CREATE INDEX "idx_seller_reserve_entries_seller_id" ON "public"."seller_reserve_entries" USING "btree" ("seller_id");



CREATE INDEX "idx_seller_reserve_entries_status" ON "public"."seller_reserve_entries" USING "btree" ("status");



CREATE INDEX "idx_seller_tag_requests_seller_id" ON "public"."seller_tag_requests" USING "btree" ("seller_id");



CREATE INDEX "idx_seller_tag_requests_seller_tier_snapshot" ON "public"."seller_tag_requests" USING "btree" ("seller_tier_snapshot");



CREATE INDEX "idx_seller_tag_requests_status" ON "public"."seller_tag_requests" USING "btree" ("status");



CREATE INDEX "idx_seller_tier_history_change_source" ON "public"."seller_tier_history" USING "btree" ("change_source");



CREATE INDEX "idx_seller_tier_history_created_at" ON "public"."seller_tier_history" USING "btree" ("created_at");



CREATE INDEX "idx_seller_tier_history_seller_id" ON "public"."seller_tier_history" USING "btree" ("seller_id");



CREATE INDEX "idx_seller_trust_evaluations_created_at" ON "public"."seller_trust_evaluations" USING "btree" ("created_at");



CREATE INDEX "idx_seller_trust_evaluations_seller_id" ON "public"."seller_trust_evaluations" USING "btree" ("seller_id");



CREATE INDEX "idx_seller_violations_created_at" ON "public"."seller_violations" USING "btree" ("created_at");



CREATE INDEX "idx_seller_violations_order_id" ON "public"."seller_violations" USING "btree" ("order_id");



CREATE INDEX "idx_seller_violations_seller_id" ON "public"."seller_violations" USING "btree" ("seller_id");



CREATE INDEX "idx_seller_violations_violation_type" ON "public"."seller_violations" USING "btree" ("violation_type");



CREATE INDEX "idx_sneakers_name" ON "public"."sneakers" USING "btree" ("name");



CREATE UNIQUE INDEX "idx_sneakers_normalized_sku" ON "public"."sneakers" USING "btree" ("normalized_sku");



CREATE UNIQUE INDEX "idx_sneakers_sku" ON "public"."sneakers" USING "btree" ("sku");



CREATE INDEX "idx_tag_orders_created_at" ON "public"."tag_orders" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_tag_orders_paid_at" ON "public"."tag_orders" USING "btree" ("paid_at");



CREATE INDEX "idx_tag_orders_seller_id" ON "public"."tag_orders" USING "btree" ("seller_id");



CREATE UNIQUE INDEX "idx_tag_orders_shippo_transaction_id" ON "public"."tag_orders" USING "btree" ("shippo_transaction_id") WHERE ("shippo_transaction_id" IS NOT NULL);



CREATE INDEX "idx_tag_orders_status" ON "public"."tag_orders" USING "btree" ("status");



CREATE UNIQUE INDEX "idx_tag_orders_stripe_checkout_session_id" ON "public"."tag_orders" USING "btree" ("stripe_checkout_session_id") WHERE ("stripe_checkout_session_id" IS NOT NULL);



CREATE UNIQUE INDEX "idx_tag_orders_stripe_payment_intent_id" ON "public"."tag_orders" USING "btree" ("stripe_payment_intent_id") WHERE ("stripe_payment_intent_id" IS NOT NULL);



CREATE INDEX "idx_withdrawal_requests_created_at" ON "public"."withdrawal_requests" USING "btree" ("created_at");



CREATE UNIQUE INDEX "idx_withdrawal_requests_idempotency_key_unique" ON "public"."withdrawal_requests" USING "btree" ("idempotency_key") WHERE ("idempotency_key" IS NOT NULL);



CREATE INDEX "idx_withdrawal_requests_review_required" ON "public"."withdrawal_requests" USING "btree" ("review_required");



CREATE INDEX "idx_withdrawal_requests_reviewed_by_admin_id" ON "public"."withdrawal_requests" USING "btree" ("reviewed_by_admin_id");



CREATE INDEX "idx_withdrawal_requests_seller_id" ON "public"."withdrawal_requests" USING "btree" ("seller_id");



CREATE INDEX "idx_withdrawal_requests_status" ON "public"."withdrawal_requests" USING "btree" ("status");



CREATE UNIQUE INDEX "idx_withdrawal_requests_stripe_transfer_id_unique" ON "public"."withdrawal_requests" USING "btree" ("stripe_transfer_id") WHERE ("stripe_transfer_id" IS NOT NULL);



CREATE OR REPLACE TRIGGER "follows_decrement" AFTER DELETE ON "public"."follows" FOR EACH ROW EXECUTE FUNCTION "public"."on_follow_deleted"();



CREATE OR REPLACE TRIGGER "follows_increment" AFTER INSERT ON "public"."follows" FOR EACH ROW EXECUTE FUNCTION "public"."on_follow_inserted"();



CREATE OR REPLACE TRIGGER "listing_variants_sync_after_delete" AFTER DELETE ON "public"."listing_variants" FOR EACH ROW EXECUTE FUNCTION "public"."on_listing_variant_changed"();



CREATE OR REPLACE TRIGGER "listing_variants_sync_after_insert" AFTER INSERT ON "public"."listing_variants" FOR EACH ROW EXECUTE FUNCTION "public"."on_listing_variant_changed"();



CREATE OR REPLACE TRIGGER "listing_variants_sync_after_update" AFTER UPDATE ON "public"."listing_variants" FOR EACH ROW EXECUTE FUNCTION "public"."on_listing_variant_changed"();



CREATE OR REPLACE TRIGGER "post_likes_decrement" AFTER DELETE ON "public"."post_likes" FOR EACH ROW EXECUTE FUNCTION "public"."on_post_like_deleted"();



CREATE OR REPLACE TRIGGER "post_likes_increment" AFTER INSERT ON "public"."post_likes" FOR EACH ROW EXECUTE FUNCTION "public"."on_post_like_inserted"();



CREATE OR REPLACE TRIGGER "prepare_listing_identity_before_write" BEFORE INSERT OR UPDATE OF "sku", "listing_type" ON "public"."listings" FOR EACH ROW EXECUTE FUNCTION "public"."prepare_listing_identity"();



CREATE OR REPLACE TRIGGER "prevent_relay_balance_ledger_delete" BEFORE DELETE ON "public"."relay_balance_ledger" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_relay_balance_ledger_mutation"();



CREATE OR REPLACE TRIGGER "prevent_relay_balance_ledger_update" BEFORE UPDATE ON "public"."relay_balance_ledger" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_relay_balance_ledger_mutation"();



CREATE OR REPLACE TRIGGER "reviews_update_seller_stats" AFTER INSERT ON "public"."reviews" FOR EACH ROW EXECUTE FUNCTION "public"."on_review_inserted"();



CREATE OR REPLACE TRIGGER "sync_relay_balance_after_exposure_hold_write" AFTER INSERT OR DELETE OR UPDATE ON "public"."exposure_holds" FOR EACH ROW EXECUTE FUNCTION "public"."sync_relay_balance_from_exposure_holds"();



CREATE OR REPLACE TRIGGER "sync_relay_balance_after_ledger_insert" AFTER INSERT OR DELETE ON "public"."relay_balance_ledger" FOR EACH ROW EXECUTE FUNCTION "public"."sync_relay_balance_from_ledger"();



CREATE OR REPLACE TRIGGER "update_catalog_products_updated_at" BEFORE UPDATE ON "public"."catalog_products" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_high_risk_skus_updated_at" BEFORE UPDATE ON "public"."high_risk_skus" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_listing_used_items_updated_at" BEFORE UPDATE ON "public"."listing_used_items" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_listing_variants_updated_at" BEFORE UPDATE ON "public"."listing_variants" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_listings_updated_at" BEFORE UPDATE ON "public"."listings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_order_chain_of_custody_updated_at" BEFORE UPDATE ON "public"."order_chain_of_custody" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_order_disputes_updated_at" BEFORE UPDATE ON "public"."order_disputes" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_order_payouts_updated_at" BEFORE UPDATE ON "public"."order_payouts" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_orders_updated_at" BEFORE UPDATE ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_relay_balances_updated_at" BEFORE UPDATE ON "public"."relay_balances" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_relay_tags_updated_at" BEFORE UPDATE ON "public"."relay_tags" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_seller_applications_updated_at" BEFORE UPDATE ON "public"."seller_applications" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_seller_identity_profiles_updated_at" BEFORE UPDATE ON "public"."seller_identity_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_seller_reserve_accounts_updated_at" BEFORE UPDATE ON "public"."seller_reserve_accounts" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_seller_reserve_entries_updated_at" BEFORE UPDATE ON "public"."seller_reserve_entries" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_seller_tag_requests_updated_at" BEFORE UPDATE ON "public"."seller_tag_requests" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_sneakers_updated_at" BEFORE UPDATE ON "public"."sneakers" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_tag_orders_updated_at" BEFORE UPDATE ON "public"."tag_orders" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



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
    ADD CONSTRAINT "custom_offers_listing_used_item_id_fkey" FOREIGN KEY ("listing_used_item_id") REFERENCES "public"."listing_used_items"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."custom_offers"
    ADD CONSTRAINT "custom_offers_listing_variant_id_fkey" FOREIGN KEY ("listing_variant_id") REFERENCES "public"."listing_variants"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."custom_offers"
    ADD CONSTRAINT "custom_offers_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exposure_holds"
    ADD CONSTRAINT "exposure_holds_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exposure_holds"
    ADD CONSTRAINT "exposure_holds_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."follows"
    ADD CONSTRAINT "follows_follower_id_fkey" FOREIGN KEY ("follower_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."follows"
    ADD CONSTRAINT "follows_following_id_fkey" FOREIGN KEY ("following_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."high_risk_skus"
    ADD CONSTRAINT "high_risk_skus_created_by_admin_id_fkey" FOREIGN KEY ("created_by_admin_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."high_risk_skus"
    ADD CONSTRAINT "high_risk_skus_removed_by_admin_id_fkey" FOREIGN KEY ("removed_by_admin_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."integration_api_logs"
    ADD CONSTRAINT "integration_api_logs_api_key_id_fkey" FOREIGN KEY ("api_key_id") REFERENCES "public"."seller_api_keys"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."integration_api_logs"
    ADD CONSTRAINT "integration_api_logs_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."listing_used_items"
    ADD CONSTRAINT "listing_used_items_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."listing_variants"
    ADD CONSTRAINT "listing_variants_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."listings"
    ADD CONSTRAINT "listings_catalog_product_id_fkey" FOREIGN KEY ("catalog_product_id") REFERENCES "public"."catalog_products"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."listings"
    ADD CONSTRAINT "listings_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."listings"
    ADD CONSTRAINT "listings_sneaker_id_fkey" FOREIGN KEY ("sneaker_id") REFERENCES "public"."sneakers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_chain_of_custody"
    ADD CONSTRAINT "order_chain_of_custody_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_chain_of_custody"
    ADD CONSTRAINT "order_chain_of_custody_relay_tag_id_fkey" FOREIGN KEY ("relay_tag_id") REFERENCES "public"."relay_tags"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."order_disputes"
    ADD CONSTRAINT "order_disputes_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."order_disputes"
    ADD CONSTRAINT "order_disputes_opened_by_user_id_fkey" FOREIGN KEY ("opened_by_user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."order_disputes"
    ADD CONSTRAINT "order_disputes_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_disputes"
    ADD CONSTRAINT "order_disputes_resolved_by_admin_id_fkey" FOREIGN KEY ("resolved_by_admin_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."order_disputes"
    ADD CONSTRAINT "order_disputes_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."order_payouts"
    ADD CONSTRAINT "order_payouts_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_payouts"
    ADD CONSTRAINT "order_payouts_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_checkcheck_reviewed_by_admin_id_fkey" FOREIGN KEY ("checkcheck_reviewed_by_admin_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_custom_offer_id_fkey" FOREIGN KEY ("custom_offer_id") REFERENCES "public"."custom_offers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_high_risk_sku_id_fkey" FOREIGN KEY ("high_risk_sku_id") REFERENCES "public"."high_risk_skus"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_listing_used_item_id_fkey" FOREIGN KEY ("listing_used_item_id") REFERENCES "public"."listing_used_items"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_listing_variant_id_fkey" FOREIGN KEY ("listing_variant_id") REFERENCES "public"."listing_variants"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_relay_tag_id_fkey" FOREIGN KEY ("relay_tag_id") REFERENCES "public"."relay_tags"("id") ON DELETE SET NULL;



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



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_tier_3_approved_by_fkey" FOREIGN KEY ("tier_3_approved_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_tier_manually_overridden_by_fkey" FOREIGN KEY ("tier_manually_overridden_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."relay_audit_events"
    ADD CONSTRAINT "relay_audit_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."relay_audit_events"
    ADD CONSTRAINT "relay_audit_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."relay_audit_events"
    ADD CONSTRAINT "relay_audit_events_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."relay_balance_ledger"
    ADD CONSTRAINT "relay_balance_ledger_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."relay_balance_ledger"
    ADD CONSTRAINT "relay_balance_ledger_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."relay_balances"
    ADD CONSTRAINT "relay_balances_frozen_by_admin_id_fkey" FOREIGN KEY ("frozen_by_admin_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."relay_balances"
    ADD CONSTRAINT "relay_balances_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."relay_tag_scan_events"
    ADD CONSTRAINT "relay_tag_scan_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."relay_tag_scan_events"
    ADD CONSTRAINT "relay_tag_scan_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."relay_tag_scan_events"
    ADD CONSTRAINT "relay_tag_scan_events_relay_tag_id_fkey" FOREIGN KEY ("relay_tag_id") REFERENCES "public"."relay_tags"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."relay_tag_scan_events"
    ADD CONSTRAINT "relay_tag_scan_events_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."relay_tags"
    ADD CONSTRAINT "relay_tags_assigned_by_admin_id_fkey" FOREIGN KEY ("assigned_by_admin_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."relay_tags"
    ADD CONSTRAINT "relay_tags_assigned_order_id_fkey" FOREIGN KEY ("assigned_order_id") REFERENCES "public"."orders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."relay_tags"
    ADD CONSTRAINT "relay_tags_assigned_seller_id_fkey" FOREIGN KEY ("assigned_seller_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."relay_tags"
    ADD CONSTRAINT "relay_tags_voided_by_admin_id_fkey" FOREIGN KEY ("voided_by_admin_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."seller_api_keys"
    ADD CONSTRAINT "seller_api_keys_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."seller_applications"
    ADD CONSTRAINT "seller_applications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."seller_identity_profiles"
    ADD CONSTRAINT "seller_identity_profiles_false_positive_cleared_by_admin_i_fkey" FOREIGN KEY ("false_positive_cleared_by_admin_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."seller_identity_profiles"
    ADD CONSTRAINT "seller_identity_profiles_matched_banned_identity_id_fkey" FOREIGN KEY ("matched_banned_identity_id") REFERENCES "public"."seller_identity_profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."seller_identity_profiles"
    ADD CONSTRAINT "seller_identity_profiles_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."seller_reserve_accounts"
    ADD CONSTRAINT "seller_reserve_accounts_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."seller_reserve_entries"
    ADD CONSTRAINT "seller_reserve_entries_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."seller_reserve_entries"
    ADD CONSTRAINT "seller_reserve_entries_order_payout_id_fkey" FOREIGN KEY ("order_payout_id") REFERENCES "public"."order_payouts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."seller_reserve_entries"
    ADD CONSTRAINT "seller_reserve_entries_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."seller_tag_requests"
    ADD CONSTRAINT "seller_tag_requests_reviewed_by_admin_id_fkey" FOREIGN KEY ("reviewed_by_admin_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."seller_tag_requests"
    ADD CONSTRAINT "seller_tag_requests_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."seller_tier_history"
    ADD CONSTRAINT "seller_tier_history_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."seller_tier_history"
    ADD CONSTRAINT "seller_tier_history_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."seller_trust_evaluations"
    ADD CONSTRAINT "seller_trust_evaluations_evaluated_by_user_id_fkey" FOREIGN KEY ("evaluated_by_user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."seller_trust_evaluations"
    ADD CONSTRAINT "seller_trust_evaluations_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."seller_violations"
    ADD CONSTRAINT "seller_violations_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."seller_violations"
    ADD CONSTRAINT "seller_violations_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."seller_violations"
    ADD CONSTRAINT "seller_violations_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tag_orders"
    ADD CONSTRAINT "tag_orders_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."withdrawal_requests"
    ADD CONSTRAINT "withdrawal_requests_canceled_by_admin_id_fkey" FOREIGN KEY ("canceled_by_admin_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."withdrawal_requests"
    ADD CONSTRAINT "withdrawal_requests_reviewed_by_admin_id_fkey" FOREIGN KEY ("reviewed_by_admin_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."withdrawal_requests"
    ADD CONSTRAINT "withdrawal_requests_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



CREATE POLICY "Admins can manage audit events" ON "public"."relay_audit_events" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can manage chain of custody" ON "public"."order_chain_of_custody" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can manage disputes" ON "public"."order_disputes" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can manage exposure holds" ON "public"."exposure_holds" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can manage high risk skus" ON "public"."high_risk_skus" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can manage order payouts" ON "public"."order_payouts" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can manage relay balance ledger" ON "public"."relay_balance_ledger" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can manage relay balances" ON "public"."relay_balances" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can manage relay tag scan events" ON "public"."relay_tag_scan_events" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can manage relay tags" ON "public"."relay_tags" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can manage reserve accounts" ON "public"."seller_reserve_accounts" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can manage reserve entries" ON "public"."seller_reserve_entries" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can manage seller identity profiles" ON "public"."seller_identity_profiles" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can manage seller tier history" ON "public"."seller_tier_history" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can manage seller trust evaluations" ON "public"."seller_trust_evaluations" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can manage seller violations" ON "public"."seller_violations" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can manage tag orders" ON "public"."tag_orders" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can manage tag requests" ON "public"."seller_tag_requests" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can manage withdrawal requests" ON "public"."withdrawal_requests" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can read audit events" ON "public"."relay_audit_events" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can read high risk skus" ON "public"."high_risk_skus" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can read integration api logs" ON "public"."integration_api_logs" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can read seller tier history" ON "public"."seller_tier_history" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can read seller trust evaluations" ON "public"."seller_trust_evaluations" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can read seller violations" ON "public"."seller_violations" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Anyone can read site settings" ON "public"."site_settings" FOR SELECT USING (true);



CREATE POLICY "Assigned sellers can read relay tags" ON "public"."relay_tags" FOR SELECT USING ((("auth"."uid"() = "assigned_seller_id") OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text"))))));



CREATE POLICY "Buyers can create orders" ON "public"."orders" FOR INSERT WITH CHECK (("auth"."uid"() = "buyer_id"));



CREATE POLICY "Buyers can read their order payouts" ON "public"."order_payouts" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."orders" "o"
  WHERE (("o"."id" = "order_payouts"."order_id") AND ("o"."buyer_id" = "auth"."uid"())))));



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



CREATE POLICY "Everyone can read listing used items" ON "public"."listing_used_items" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."listings"
  WHERE (("listings"."id" = "listing_used_items"."listing_id") AND (("listings"."status" = 'active'::"text") OR ("listings"."seller_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."profiles"
          WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))) OR (EXISTS ( SELECT 1
           FROM "public"."orders"
          WHERE (("orders"."listing_id" = "listing_used_items"."listing_id") AND (("orders"."buyer_id" = "auth"."uid"()) OR ("orders"."seller_id" = "auth"."uid"()))))))))));



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



CREATE POLICY "Everyone can read sneakers" ON "public"."sneakers" FOR SELECT USING (true);



CREATE POLICY "Only admins can delete applications" ON "public"."seller_applications" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Only admins can delete profiles" ON "public"."profiles" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "profiles_1"
  WHERE (("profiles_1"."id" = "auth"."uid"()) AND ("profiles_1"."role" = 'admin'::"text")))));



CREATE POLICY "Only admins can update site settings" ON "public"."site_settings" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Order participants can read chain of custody" ON "public"."order_chain_of_custody" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."orders"
  WHERE (("orders"."id" = "order_chain_of_custody"."order_id") AND (("orders"."buyer_id" = "auth"."uid"()) OR ("orders"."seller_id" = "auth"."uid"()))))) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text"))))));



CREATE POLICY "Order participants can read disputes" ON "public"."order_disputes" FOR SELECT USING ((("auth"."uid"() = "buyer_id") OR ("auth"."uid"() = "seller_id") OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text"))))));



CREATE POLICY "Order participants can read relay tag scan events" ON "public"."relay_tag_scan_events" FOR SELECT USING ((("auth"."uid"() = "seller_id") OR (EXISTS ( SELECT 1
   FROM "public"."orders"
  WHERE (("orders"."id" = "relay_tag_scan_events"."order_id") AND (("orders"."buyer_id" = "auth"."uid"()) OR ("orders"."seller_id" = "auth"."uid"()))))) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text"))))));



CREATE POLICY "Profiles are viewable by everyone" ON "public"."profiles" FOR SELECT USING (true);



CREATE POLICY "Sellers can create their tag requests" ON "public"."seller_tag_requests" FOR INSERT WITH CHECK (("auth"."uid"() = "seller_id"));



CREATE POLICY "Sellers can delete listing used items" ON "public"."listing_used_items" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."listings"
  WHERE (("listings"."id" = "listing_used_items"."listing_id") AND (("listings"."seller_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."profiles"
          WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))))))));



CREATE POLICY "Sellers can delete listing variants" ON "public"."listing_variants" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."listings"
  WHERE (("listings"."id" = "listing_variants"."listing_id") AND (("listings"."seller_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."profiles"
          WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))))))));



CREATE POLICY "Sellers can delete their own listings" ON "public"."listings" FOR DELETE USING (("auth"."uid"() = "seller_id"));



CREATE POLICY "Sellers can delete their own posts" ON "public"."posts" FOR DELETE USING (("auth"."uid"() = "seller_id"));



CREATE POLICY "Sellers can insert listing used items" ON "public"."listing_used_items" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."listings"
  WHERE (("listings"."id" = "listing_used_items"."listing_id") AND (("listings"."seller_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."profiles"
          WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))))))));



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



CREATE POLICY "Sellers can read their exposure holds" ON "public"."exposure_holds" FOR SELECT USING ((("auth"."uid"() = "seller_id") OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text"))))));



CREATE POLICY "Sellers can read their order payouts" ON "public"."order_payouts" FOR SELECT USING (("seller_id" = "auth"."uid"()));



CREATE POLICY "Sellers can read their own identity profile" ON "public"."seller_identity_profiles" FOR SELECT USING ((("auth"."uid"() = "seller_id") OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text"))))));



CREATE POLICY "Sellers can read their relay balance ledger" ON "public"."relay_balance_ledger" FOR SELECT USING ((("auth"."uid"() = "seller_id") OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text"))))));



CREATE POLICY "Sellers can read their relay balances" ON "public"."relay_balances" FOR SELECT USING ((("auth"."uid"() = "seller_id") OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text"))))));



CREATE POLICY "Sellers can read their reserve account" ON "public"."seller_reserve_accounts" FOR SELECT USING ((("auth"."uid"() = "seller_id") OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text"))))));



CREATE POLICY "Sellers can read their reserve entries" ON "public"."seller_reserve_entries" FOR SELECT USING ((("auth"."uid"() = "seller_id") OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text"))))));



CREATE POLICY "Sellers can read their tag orders" ON "public"."tag_orders" FOR SELECT USING ((("auth"."uid"() = "seller_id") OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text"))))));



CREATE POLICY "Sellers can read their tag requests" ON "public"."seller_tag_requests" FOR SELECT USING ((("auth"."uid"() = "seller_id") OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text"))))));



CREATE POLICY "Sellers can read their withdrawal requests" ON "public"."withdrawal_requests" FOR SELECT USING ((("auth"."uid"() = "seller_id") OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text"))))));



CREATE POLICY "Sellers can update listing used items" ON "public"."listing_used_items" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."listings"
  WHERE (("listings"."id" = "listing_used_items"."listing_id") AND (("listings"."seller_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."profiles"
          WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))))))));



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


ALTER TABLE "public"."exposure_holds" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."follows" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."high_risk_skus" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."integration_api_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."listing_used_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."listing_variants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."listings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."order_chain_of_custody" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."order_disputes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."order_payouts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."orders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."post_likes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."posts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."relay_audit_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."relay_balance_ledger" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."relay_balances" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."relay_tag_scan_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."relay_tags" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."reviews" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."seller_api_keys" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."seller_applications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."seller_identity_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."seller_reserve_accounts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."seller_reserve_entries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."seller_tag_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."seller_tier_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."seller_trust_evaluations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."seller_violations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."site_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sneakers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tag_orders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."withdrawal_requests" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."messages";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."orders";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































GRANT ALL ON FUNCTION "public"."create_relay_balance_order_purchase"("p_buyer_id" "uuid", "p_seller_id" "uuid", "p_listing_id" "uuid", "p_listing_variant_id" "uuid", "p_listing_used_item_id" "uuid", "p_custom_offer_id" "uuid", "p_size" "text", "p_shoe_price_cents" bigint, "p_shipping_cost_cents" bigint, "p_total_charge_cents" bigint, "p_relay_fee_cents" bigint, "p_stripe_fee_estimate_cents" bigint, "p_seller_proceeds_cents" bigint, "p_buyer_shipping_address" "jsonb", "p_challenge_code" "text", "p_shipping_deadline" timestamp with time zone, "p_purchased_condition_photo_url" "text", "p_auth_snapshot" "jsonb", "p_payout_snapshot" "jsonb", "p_checkout_idempotency_key" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_relay_balance_order_purchase"("p_buyer_id" "uuid", "p_seller_id" "uuid", "p_listing_id" "uuid", "p_listing_variant_id" "uuid", "p_listing_used_item_id" "uuid", "p_custom_offer_id" "uuid", "p_size" "text", "p_shoe_price_cents" bigint, "p_shipping_cost_cents" bigint, "p_total_charge_cents" bigint, "p_relay_fee_cents" bigint, "p_stripe_fee_estimate_cents" bigint, "p_seller_proceeds_cents" bigint, "p_buyer_shipping_address" "jsonb", "p_challenge_code" "text", "p_shipping_deadline" timestamp with time zone, "p_purchased_condition_photo_url" "text", "p_auth_snapshot" "jsonb", "p_payout_snapshot" "jsonb", "p_checkout_idempotency_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_relay_balance_order_purchase"("p_buyer_id" "uuid", "p_seller_id" "uuid", "p_listing_id" "uuid", "p_listing_variant_id" "uuid", "p_listing_used_item_id" "uuid", "p_custom_offer_id" "uuid", "p_size" "text", "p_shoe_price_cents" bigint, "p_shipping_cost_cents" bigint, "p_total_charge_cents" bigint, "p_relay_fee_cents" bigint, "p_stripe_fee_estimate_cents" bigint, "p_seller_proceeds_cents" bigint, "p_buyer_shipping_address" "jsonb", "p_challenge_code" "text", "p_shipping_deadline" timestamp with time zone, "p_purchased_condition_photo_url" "text", "p_auth_snapshot" "jsonb", "p_payout_snapshot" "jsonb", "p_checkout_idempotency_key" "text") TO "service_role";



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



GRANT ALL ON FUNCTION "public"."prevent_relay_balance_ledger_mutation"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_relay_balance_ledger_mutation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_relay_balance_ledger_mutation"() TO "service_role";



GRANT ALL ON FUNCTION "public"."recalculate_relay_balance"("target_seller_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."recalculate_relay_balance"("target_seller_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."recalculate_relay_balance"("target_seller_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."resolve_launch_refund_seller_recovery"("p_order_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."resolve_launch_refund_seller_recovery"("p_order_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_launch_refund_seller_recovery"("p_order_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_listing_from_variants"("target_listing_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."sync_listing_from_variants"("target_listing_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_listing_from_variants"("target_listing_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_relay_balance_from_exposure_holds"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_relay_balance_from_exposure_holds"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_relay_balance_from_exposure_holds"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_relay_balance_from_ledger"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_relay_balance_from_ledger"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_relay_balance_from_ledger"() TO "service_role";



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



GRANT ALL ON TABLE "public"."exposure_holds" TO "anon";
GRANT ALL ON TABLE "public"."exposure_holds" TO "authenticated";
GRANT ALL ON TABLE "public"."exposure_holds" TO "service_role";



GRANT ALL ON TABLE "public"."follows" TO "anon";
GRANT ALL ON TABLE "public"."follows" TO "authenticated";
GRANT ALL ON TABLE "public"."follows" TO "service_role";



GRANT ALL ON TABLE "public"."high_risk_skus" TO "anon";
GRANT ALL ON TABLE "public"."high_risk_skus" TO "authenticated";
GRANT ALL ON TABLE "public"."high_risk_skus" TO "service_role";



GRANT ALL ON TABLE "public"."integration_api_logs" TO "anon";
GRANT ALL ON TABLE "public"."integration_api_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."integration_api_logs" TO "service_role";



GRANT ALL ON TABLE "public"."listing_used_items" TO "anon";
GRANT ALL ON TABLE "public"."listing_used_items" TO "authenticated";
GRANT ALL ON TABLE "public"."listing_used_items" TO "service_role";



GRANT ALL ON TABLE "public"."listing_variants" TO "anon";
GRANT ALL ON TABLE "public"."listing_variants" TO "authenticated";
GRANT ALL ON TABLE "public"."listing_variants" TO "service_role";



GRANT ALL ON TABLE "public"."listings" TO "anon";
GRANT ALL ON TABLE "public"."listings" TO "authenticated";
GRANT ALL ON TABLE "public"."listings" TO "service_role";



GRANT ALL ON TABLE "public"."messages" TO "anon";
GRANT ALL ON TABLE "public"."messages" TO "authenticated";
GRANT ALL ON TABLE "public"."messages" TO "service_role";



GRANT ALL ON TABLE "public"."order_chain_of_custody" TO "anon";
GRANT ALL ON TABLE "public"."order_chain_of_custody" TO "authenticated";
GRANT ALL ON TABLE "public"."order_chain_of_custody" TO "service_role";



GRANT ALL ON TABLE "public"."order_disputes" TO "anon";
GRANT ALL ON TABLE "public"."order_disputes" TO "authenticated";
GRANT ALL ON TABLE "public"."order_disputes" TO "service_role";



GRANT ALL ON TABLE "public"."order_payouts" TO "anon";
GRANT ALL ON TABLE "public"."order_payouts" TO "authenticated";
GRANT ALL ON TABLE "public"."order_payouts" TO "service_role";



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



GRANT ALL ON TABLE "public"."relay_audit_events" TO "anon";
GRANT ALL ON TABLE "public"."relay_audit_events" TO "authenticated";
GRANT ALL ON TABLE "public"."relay_audit_events" TO "service_role";



GRANT ALL ON TABLE "public"."relay_balance_ledger" TO "anon";
GRANT ALL ON TABLE "public"."relay_balance_ledger" TO "authenticated";
GRANT ALL ON TABLE "public"."relay_balance_ledger" TO "service_role";



GRANT ALL ON TABLE "public"."relay_balances" TO "anon";
GRANT ALL ON TABLE "public"."relay_balances" TO "authenticated";
GRANT ALL ON TABLE "public"."relay_balances" TO "service_role";



GRANT ALL ON TABLE "public"."relay_tag_scan_events" TO "anon";
GRANT ALL ON TABLE "public"."relay_tag_scan_events" TO "authenticated";
GRANT ALL ON TABLE "public"."relay_tag_scan_events" TO "service_role";



GRANT ALL ON TABLE "public"."relay_tags" TO "anon";
GRANT ALL ON TABLE "public"."relay_tags" TO "authenticated";
GRANT ALL ON TABLE "public"."relay_tags" TO "service_role";



GRANT ALL ON TABLE "public"."reviews" TO "anon";
GRANT ALL ON TABLE "public"."reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."reviews" TO "service_role";



GRANT ALL ON TABLE "public"."seller_api_keys" TO "anon";
GRANT ALL ON TABLE "public"."seller_api_keys" TO "authenticated";
GRANT ALL ON TABLE "public"."seller_api_keys" TO "service_role";



GRANT ALL ON TABLE "public"."seller_applications" TO "anon";
GRANT ALL ON TABLE "public"."seller_applications" TO "authenticated";
GRANT ALL ON TABLE "public"."seller_applications" TO "service_role";



GRANT ALL ON TABLE "public"."seller_identity_profiles" TO "anon";
GRANT ALL ON TABLE "public"."seller_identity_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."seller_identity_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."seller_reserve_accounts" TO "anon";
GRANT ALL ON TABLE "public"."seller_reserve_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."seller_reserve_accounts" TO "service_role";



GRANT ALL ON TABLE "public"."seller_reserve_entries" TO "anon";
GRANT ALL ON TABLE "public"."seller_reserve_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."seller_reserve_entries" TO "service_role";



GRANT ALL ON TABLE "public"."seller_tag_requests" TO "anon";
GRANT ALL ON TABLE "public"."seller_tag_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."seller_tag_requests" TO "service_role";



GRANT ALL ON TABLE "public"."seller_tier_history" TO "anon";
GRANT ALL ON TABLE "public"."seller_tier_history" TO "authenticated";
GRANT ALL ON TABLE "public"."seller_tier_history" TO "service_role";



GRANT ALL ON TABLE "public"."seller_trust_evaluations" TO "anon";
GRANT ALL ON TABLE "public"."seller_trust_evaluations" TO "authenticated";
GRANT ALL ON TABLE "public"."seller_trust_evaluations" TO "service_role";



GRANT ALL ON TABLE "public"."seller_violations" TO "anon";
GRANT ALL ON TABLE "public"."seller_violations" TO "authenticated";
GRANT ALL ON TABLE "public"."seller_violations" TO "service_role";



GRANT ALL ON TABLE "public"."site_settings" TO "anon";
GRANT ALL ON TABLE "public"."site_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."site_settings" TO "service_role";



GRANT ALL ON TABLE "public"."sneakers" TO "anon";
GRANT ALL ON TABLE "public"."sneakers" TO "authenticated";
GRANT ALL ON TABLE "public"."sneakers" TO "service_role";



GRANT ALL ON TABLE "public"."tag_orders" TO "anon";
GRANT ALL ON TABLE "public"."tag_orders" TO "authenticated";
GRANT ALL ON TABLE "public"."tag_orders" TO "service_role";



GRANT ALL ON TABLE "public"."withdrawal_requests" TO "anon";
GRANT ALL ON TABLE "public"."withdrawal_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."withdrawal_requests" TO "service_role";









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































