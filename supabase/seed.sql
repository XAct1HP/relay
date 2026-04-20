-- Seed data for Relay marketplace
-- This file contains realistic sample data for development and testing

-- ============================================================================
-- HOW TO USE THIS SEED FILE
-- ============================================================================
-- STEP 1: Go to Supabase Dashboard → Authentication → Users
-- STEP 2: Create 3 users with these credentials:
--   • admin@relay.local    / TestPassword123!
--   • sneaker_reseller@relay.local / TestPassword123!
--   • sneaker_collector@relay.local / TestPassword123!
-- STEP 3: Copy each user's UUID from the dashboard
-- STEP 4: Paste the UUIDs into the 3 lines below (replace the placeholder values)
-- STEP 5: Run this entire script in Supabase SQL Editor

-- ============================================================================
-- ⬇️ PASTE YOUR UUIDS HERE (only 3 lines to change!) ⬇️
-- ============================================================================
DO $$
DECLARE
  admin_id  UUID := 'ec8e553e-f4cf-4c88-bd71-b303b55e08b2'; -- Replace with admin@relay.local UUID
  seller_id UUID := 'cdb72c47-1848-4fd9-904e-cb09a6e30696'; -- Replace with sneaker_reseller@relay.local UUID
  buyer_id  UUID := '5212e40a-f82c-4e0c-be45-75aaa4ef6f72'; -- Replace with sneaker_collector@relay.local UUID
BEGIN

-- ============================================================================
-- CLEAN EXISTING SEED DATA (safe to re-run)
-- ============================================================================
DELETE FROM reviews;
DELETE FROM custom_offers;
DELETE FROM messages;
DELETE FROM conversations;
DELETE FROM post_likes;
DELETE FROM posts;
DELETE FROM orders;
DELETE FROM seller_applications;
DELETE FROM listings;
DELETE FROM profiles WHERE id IN (admin_id, seller_id, buyer_id);

-- ============================================================================
-- INSERT PROFILES
-- ============================================================================

-- Admin user
INSERT INTO profiles (
  id, email, full_name, username, avatar_url, role, is_verified_seller,
  seller_application_status, profile_theme, display_name, bio, created_at, updated_at
) VALUES (
  admin_id,
  'admin@relay.local',
  'Admin User',
  'admin_relay',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=admin_relay',
  'admin',
  false,
  'none',
  'default',
  'Relay Admin',
  'Marketplace administrator',
  NOW(),
  NOW()
);

-- Verified seller user
INSERT INTO profiles (
  id, email, full_name, username, avatar_url, role, is_verified_seller,
  seller_application_status, stripe_account_id, shop_name, profile_banner_url,
  display_name, profile_theme, bio, ship_from_address, created_at, updated_at
) VALUES (
  seller_id,
  'sneaker_reseller@relay.local',
  'Jordan Mitchell',
  'sneaker_reseller',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=sneaker_reseller',
  'seller',
  true,
  'approved',
  'acct_1234567890abcdef',
  'Premium Kicks',
  'https://api.dicebear.com/7.x/lorelei/svg?seed=premium_kicks',
  'Jordan M.',
  'default',
  'Selling authentic vintage and modern sneakers. 5+ years reselling experience. 100% verified authentic!',
  '{"street": "123 Main St", "city": "Los Angeles", "state": "CA", "zip": "90001", "country": "US"}',
  NOW(),
  NOW()
);

-- Buyer user
INSERT INTO profiles (
  id, email, full_name, username, avatar_url, role, is_verified_seller,
  seller_application_status, display_name, profile_theme, bio, created_at, updated_at
) VALUES (
  buyer_id,
  'sneaker_collector@relay.local',
  'Alex Chen',
  'sneaker_collector',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=sneaker_collector',
  'buyer',
  false,
  'none',
  'Alex C.',
  'default',
  'Passionate sneaker collector. Always hunting for rare finds!',
  NOW(),
  NOW()
);

-- ============================================================================
-- INSERT LISTINGS
-- ============================================================================

-- Listing 1: Nike Air Jordan 1 Retro High OG
INSERT INTO listings (
  id, seller_id, brand, model, nickname, condition, box_condition,
  approx_sizing, description, images, sizes, status, created_at, updated_at
) VALUES (
  '650e8400-e29b-41d4-a716-446655440001',
  seller_id,
  'Nike',
  'Air Jordan 1 Retro High OG',
  'Chicago 2015 Retro',
  'like_new',
  'good',
  'normal',
  'Iconic Air Jordan 1 Chicago colorway from 2015 retro release. Lightly worn, kept in pristine condition. Original box included with minimal wear. Perfect condition leather and Nike Swoosh. No creasing on toe box.',
  ARRAY['https://images.example.com/aj1-chicago-1.jpg', 'https://images.example.com/aj1-chicago-2.jpg', 'https://images.example.com/aj1-chicago-3.jpg'],
  '[{"size": "10.5", "price": 450.00, "quantity": 1}, {"size": "11", "price": 450.00, "quantity": 1}]'::jsonb,
  'active',
  NOW() - INTERVAL '5 days',
  NOW() - INTERVAL '5 days'
);

-- Listing 2: Yeezy Boost 350 V2
INSERT INTO listings (
  id, seller_id, brand, model, nickname, condition, box_condition,
  approx_sizing, description, images, sizes, status, created_at, updated_at
) VALUES (
  '650e8400-e29b-41d4-a716-446655440002',
  seller_id,
  'Yeezy',
  'Boost 350 V2',
  'Zebra 2017',
  'used_excellent',
  'damaged',
  'heavy',
  'Yeezy 350 V2 Zebra from original 2017 release. Well-maintained with minimal wear. The primeknit shows no major defects, and the boost feels responsive. Box is damaged but all original materials included.',
  ARRAY['https://images.example.com/yeezy350-zebra-1.jpg', 'https://images.example.com/yeezy350-zebra-2.jpg'],
  '[{"size": "9", "price": 320.00, "quantity": 1}, {"size": "9.5", "price": 325.00, "quantity": 1}]'::jsonb,
  'active',
  NOW() - INTERVAL '3 days',
  NOW() - INTERVAL '3 days'
);

-- Listing 3: New Balance 990v3
INSERT INTO listings (
  id, seller_id, brand, model, nickname, condition, box_condition,
  approx_sizing, description, images, sizes, status, created_at, updated_at
) VALUES (
  '650e8400-e29b-41d4-a716-446655440003',
  seller_id,
  'New Balance',
  '990v3',
  'Grey/Navy Made in USA',
  'new',
  'perfect',
  'normal',
  'Brand new New Balance 990v3 in classic grey and navy colorway. Never worn, still has original tags. Made in USA. Perfect condition with all original packaging.',
  ARRAY['https://images.example.com/nb990v3-1.jpg', 'https://images.example.com/nb990v3-2.jpg', 'https://images.example.com/nb990v3-3.jpg', 'https://images.example.com/nb990v3-4.jpg'],
  '[{"size": "10.5", "price": 280.00, "quantity": 1}]'::jsonb,
  'active',
  NOW() - INTERVAL '1 day',
  NOW() - INTERVAL '1 day'
);

-- Listing 4: Adidas Ultraboost Clima (SOLD OUT)
INSERT INTO listings (
  id, seller_id, brand, model, nickname, condition, box_condition,
  approx_sizing, description, images, sizes, status, created_at, updated_at
) VALUES (
  '650e8400-e29b-41d4-a716-446655440004',
  seller_id,
  'Adidas',
  'Ultraboost Clima',
  'Core Black',
  'used_good',
  'good',
  'normal',
  'Adidas Ultraboost Clima in core black. Excellent condition with only light wear on outsole. Boost is responsive and shows minimal discoloration.',
  ARRAY['https://images.example.com/adidas-ultraboost-1.jpg', 'https://images.example.com/adidas-ultraboost-2.jpg'],
  '[{"size": "10", "price": 150.00, "quantity": 0}]'::jsonb,
  'sold_out',
  NOW() - INTERVAL '7 days',
  NOW() - INTERVAL '2 days'
);

-- Listing 5: Dunk Low Retro
INSERT INTO listings (
  id, seller_id, brand, model, nickname, condition, box_condition,
  approx_sizing, description, images, sizes, status, created_at, updated_at
) VALUES (
  '650e8400-e29b-41d4-a716-446655440005',
  seller_id,
  'Nike',
  'Dunk Low Retro',
  'University Blue',
  'used_good',
  'good',
  'lightweight',
  'Nike Dunk Low Retro in University Blue. 2021 release. Lightly worn with minimal creasing. Clean condition overall with only scuffing visible on heel tab.',
  ARRAY['https://images.example.com/dunk-low-blue-1.jpg', 'https://images.example.com/dunk-low-blue-2.jpg', 'https://images.example.com/dunk-low-blue-3.jpg'],
  '[{"size": "10", "price": 220.00, "quantity": 1}, {"size": "10.5", "price": 225.00, "quantity": 1}, {"size": "11", "price": 225.00, "quantity": 1}]'::jsonb,
  'active',
  NOW() - INTERVAL '2 days',
  NOW() - INTERVAL '2 days'
);

-- ============================================================================
-- INSERT POSTS
-- ============================================================================

-- Post 1: Seller's new inventory post
INSERT INTO posts (
  id, seller_id, content, images, likes_count, is_rising_brand, created_at
) VALUES (
  '750e8400-e29b-41d4-a716-446655440001',
  seller_id,
  'Just added 5 fresh pairs to my shop! 🔥 Including a pristine AJ1 Chicago and a pair of OG Yeezys. Everything authenticated and ready to ship. Check my listings!',
  ARRAY['https://images.example.com/inventory-post-1.jpg', 'https://images.example.com/inventory-post-2.jpg'],
  12,
  false,
  NOW() - INTERVAL '1 day'
);

-- Post 2: Seller's brand highlight post
INSERT INTO posts (
  id, seller_id, content, images, likes_count, is_rising_brand, created_at
) VALUES (
  '750e8400-e29b-41d4-a716-446655440002',
  seller_id,
  'New Balance 990v3s are absolutely insane this year. The quality control is unreal and the comfort is next level. If you love 90s aesthetics and don''t care about hype, these are essential. Already have 3 pairs! 🔥',
  ARRAY['https://images.example.com/nb990-post-1.jpg'],
  45,
  true,
  NOW() - INTERVAL '12 hours'
);

-- ============================================================================
-- INSERT POST_LIKES
-- ============================================================================

-- Buyer likes the first post
INSERT INTO post_likes (
  id, post_id, user_id, created_at
) VALUES (
  '850e8400-e29b-41d4-a716-446655440001',
  '750e8400-e29b-41d4-a716-446655440001',
  buyer_id,
  NOW() - INTERVAL '20 hours'
);

-- ============================================================================
-- INSERT CONVERSATIONS
-- ============================================================================

-- Conversation 1: About AJ1 Chicago listing
INSERT INTO conversations (
  id, participant_ids, listing_id, last_message, last_message_at, created_at
) VALUES (
  '950e8400-e29b-41d4-a716-446655440001',
  ARRAY[seller_id, buyer_id],
  '650e8400-e29b-41d4-a716-446655440001',
  'Sounds good! I''ll take the 10.5. Can you ship ASAP?',
  NOW() - INTERVAL '2 hours',
  NOW() - INTERVAL '1 day'
);

-- Conversation 2: About Yeezy 350s
INSERT INTO conversations (
  id, participant_ids, listing_id, last_message, last_message_at, created_at
) VALUES (
  '950e8400-e29b-41d4-a716-446655440002',
  ARRAY[seller_id, buyer_id],
  '650e8400-e29b-41d4-a716-446655440002',
  'Are these still available?',
  NOW() - INTERVAL '3 hours',
  NOW() - INTERVAL '6 hours'
);

-- ============================================================================
-- INSERT MESSAGES
-- ============================================================================

-- Messages in conversation 1
INSERT INTO messages (
  id, conversation_id, sender_id, content, message_type, created_at
) VALUES
  (
    'a50e8400-e29b-41d4-a716-446655440001',
    '950e8400-e29b-41d4-a716-446655440001',
    buyer_id,
    'Hi, are these still available?',
    'text',
    NOW() - INTERVAL '24 hours'
  ),
  (
    'a50e8400-e29b-41d4-a716-446655440002',
    '950e8400-e29b-41d4-a716-446655440001',
    seller_id,
    'Yes, both sizes in stock!',
    'text',
    NOW() - INTERVAL '23 hours'
  ),
  (
    'a50e8400-e29b-41d4-a716-446655440003',
    '950e8400-e29b-41d4-a716-446655440001',
    buyer_id,
    'Sounds good! I''ll take the 10.5. Can you ship ASAP?',
    'text',
    NOW() - INTERVAL '2 hours'
  );

-- Messages in conversation 2
INSERT INTO messages (
  id, conversation_id, sender_id, content, message_type, created_at
) VALUES
  (
    'a50e8400-e29b-41d4-a716-446655440004',
    '950e8400-e29b-41d4-a716-446655440002',
    buyer_id,
    'Are these still available?',
    'text',
    NOW() - INTERVAL '3 hours'
  ),
  (
    'a50e8400-e29b-41d4-a716-446655440005',
    '950e8400-e29b-41d4-a716-446655440002',
    seller_id,
    'Yep! Size 9 and 9.5 available. What size are you interested in?',
    'text',
    NOW() - INTERVAL '2 hours 45 minutes'
  );

-- ============================================================================
-- INSERT CUSTOM_OFFERS
-- ============================================================================

-- Custom offer on Yeezy Boost 350
INSERT INTO custom_offers (
  id, conversation_id, sender_id, listing_id, size, original_price,
  offer_price, status, created_at, expires_at
) VALUES (
  'b50e8400-e29b-41d4-a716-446655440001',
  '950e8400-e29b-41d4-a716-446655440002',
  buyer_id,
  '650e8400-e29b-41d4-a716-446655440002',
  '9',
  325.00,
  300.00,
  'pending',
  NOW() - INTERVAL '2 hours',
  NOW() + INTERVAL '22 hours'
);

-- ============================================================================
-- INSERT ORDERS
-- ============================================================================

-- Order 1: Paid - Dunk Low
INSERT INTO orders (
  id, listing_id, buyer_id, seller_id, size, price, shipping_cost,
  shipping_buffer, platform_fee, stripe_fee, seller_earnings,
  status, stripe_payment_intent_id, buyer_shipping_address,
  shipping_deadline, review_deadline, created_at, updated_at
) VALUES (
  'c50e8400-e29b-41d4-a716-446655440001',
  '650e8400-e29b-41d4-a716-446655440005',
  buyer_id,
  seller_id,
  '10',
  220.00,
  8.00,
  1.50,
  22.00,
  7.50,
  190.50,
  'paid',
  'pi_1234567890abcdef',
  '{"street": "456 Oak Ave", "city": "New York", "state": "NY", "zip": "10001", "country": "US"}'::jsonb,
  NOW() + INTERVAL '5 days',
  NOW() + INTERVAL '10 days',
  NOW() - INTERVAL '3 days',
  NOW() - INTERVAL '3 days'
);

-- Order 2: Shipped - AJ1 Chicago
INSERT INTO orders (
  id, listing_id, buyer_id, seller_id, size, price, shipping_cost,
  shipping_buffer, platform_fee, stripe_fee, seller_earnings,
  status, stripe_payment_intent_id, stripe_transfer_id,
  shipping_label_url, tracking_number, tracking_status,
  buyer_shipping_address, shipping_deadline, review_deadline,
  created_at, updated_at
) VALUES (
  'c50e8400-e29b-41d4-a716-446655440002',
  '650e8400-e29b-41d4-a716-446655440001',
  buyer_id,
  seller_id,
  '10.5',
  450.00,
  12.00,
  1.50,
  45.00,
  12.50,
  393.50,
  'shipped',
  'pi_0987654321fedcba',
  'tr_1fedcba0987654321',
  'https://labels.example.com/label-aj1-chicago.pdf',
  '9400111899223456789012',
  'in_transit',
  '{"street": "456 Oak Ave", "city": "New York", "state": "NY", "zip": "10001", "country": "US"}'::jsonb,
  NOW() + INTERVAL '3 days',
  NOW() + INTERVAL '8 days',
  NOW() - INTERVAL '2 days',
  NOW() - INTERVAL '2 days'
);

-- Order 3: Delivered with review - NB 990v3
INSERT INTO orders (
  id, listing_id, buyer_id, seller_id, size, price, shipping_cost,
  shipping_buffer, platform_fee, stripe_fee, seller_earnings,
  status, stripe_payment_intent_id, stripe_transfer_id,
  shipping_label_url, tracking_number, tracking_status,
  buyer_shipping_address, review_rating, review_comment,
  shipping_deadline, review_deadline, created_at, updated_at
) VALUES (
  'c50e8400-e29b-41d4-a716-446655440003',
  '650e8400-e29b-41d4-a716-446655440003',
  buyer_id,
  seller_id,
  '10.5',
  280.00,
  10.00,
  1.50,
  28.00,
  9.50,
  243.50,
  'completed',
  'pi_abcdef1234567890',
  'tr_abcdef1234567890',
  'https://labels.example.com/label-nb990v3.pdf',
  '9400111899223456789013',
  'delivered',
  '{"street": "789 Elm St", "city": "San Francisco", "state": "CA", "zip": "94105", "country": "US"}'::jsonb,
  5,
  'Perfect condition! Just as described. Shipping was fast. Highly recommend this seller!',
  NOW() - INTERVAL '8 days',
  NOW() - INTERVAL '3 days',
  NOW() - INTERVAL '10 days',
  NOW() - INTERVAL '3 days'
);

-- ============================================================================
-- INSERT REVIEWS
-- ============================================================================

-- Review for order 3
INSERT INTO reviews (
  id, order_id, reviewer_id, seller_id, rating, comment, created_at
) VALUES (
  'd50e8400-e29b-41d4-a716-446655440001',
  'c50e8400-e29b-41d4-a716-446655440003',
  buyer_id,
  seller_id,
  5,
  'Perfect condition! Just as described. Shipping was fast. Highly recommend this seller!',
  NOW() - INTERVAL '3 days'
);

-- ============================================================================
-- INSERT SELLER_APPLICATIONS
-- ============================================================================

-- Approved seller application
INSERT INTO seller_applications (
  id, user_id, ship_from_address, questionnaire_responses,
  stripe_connected, terms_accepted, status, ai_recommendation,
  rejection_count, created_at, updated_at
) VALUES (
  'e50e8400-e29b-41d4-a716-446655440001',
  seller_id,
  '{"street": "123 Main St", "city": "Los Angeles", "state": "CA", "zip": "90001", "country": "US"}'::jsonb,
  '{"years_reselling": "5+", "monthly_sales": "50-100", "authentication_method": "personal_experience", "shipping_speed": "2-3_days"}'::jsonb,
  true,
  true,
  'approved',
  'Experienced seller with excellent track record. Approve for verified status.',
  0,
  NOW() - INTERVAL '60 days',
  NOW() - INTERVAL '60 days'
);

-- ============================================================================
-- SEED DATA COMPLETION
-- ============================================================================
-- All seed data has been inserted successfully.
-- The database now contains:
-- - 3 profiles (1 admin, 1 verified seller, 1 buyer)
-- - 5 listings (4 active, 1 sold_out)
-- - 2 posts (with likes)
-- - 1 post_like
-- - 2 conversations with messages
-- - 1 custom_offer
-- - 3 orders in different statuses
-- - 1 review
-- - 1 seller_application

-- Remember: All timestamps use NOW() for created_at and relative intervals
-- for realistic data distribution. Adjust as needed for your testing scenarios.

END $$;
