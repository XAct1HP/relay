// User type for authentication and profile
export interface User {
  id: string;
  email: string;
  full_name: string;
  username: string;
  avatar_url: string;
  role: 'buyer' | 'seller' | 'admin';
  is_verified_seller: boolean;
  seller_application_status: 'none' | 'pending' | 'approved' | 'rejected' | 'rejected_final';
  stripe_account_id: string | null;
  ship_from_address: ShippingAddress | null;
  profile_banner_url: string | null;
  display_name: string;
  shop_name: string | null;
  profile_theme: string;
  bio: string | null;
  followers_count: number;
  created_at: string;
  updated_at: string;
}

// Size and pricing option for a listing
export interface SizeOption {
  size: string;
  price: number;
  quantity: number;
}

// Shoe listing
export interface Listing {
  id: string;
  seller_id: string;
  brand: string;
  model: string;
  nickname: string | null;
  condition: 'new' | 'like_new' | 'used_excellent' | 'used_good' | 'used_fair';
  box_condition: 'perfect' | 'good' | 'damaged' | 'no_box';
  approx_sizing: 'lightweight' | 'normal' | 'heavy';
  description: string;
  images: string[];
  sizes: SizeOption[];
  status: 'active' | 'sold_out' | 'inactive' | 'removed';
  created_at: string;
  updated_at: string;
  seller?: User;
}

// Social feed post
export interface Post {
  id: string;
  seller_id: string;
  content: string;
  images: string[];
  likes_count: number;
  is_rising_brand: boolean;
  is_custom_brand: boolean;
  related_listing_id: string | null;
  created_at: string;
  seller?: User;
  related_listing?: Listing;
}

// Follow relationship
export interface Follow {
  id: string;
  follower_id: string;
  following_id: string;
  created_at: string;
}

// Purchase order
export interface Order {
  id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  size: string;
  price: number;
  shipping_cost: number;
  shipping_buffer: number;
  platform_fee: number;
  stripe_fee: number;
  seller_earnings: number;
  status: 'pending_payment' | 'paid' | 'auth_submitted' | 'label_created' | 'shipped' | 'delivered' | 'review_window' | 'completed' | 'disputed' | 'cancelled' | 'refund_pending' | 'refunded' | 'payout_failed' | 'return_pending' | 'return_shipped' | 'return_delivered';
  stripe_payment_intent_id: string | null;
  shipping_label_url: string | null;
  tracking_number: string | null;
  tracking_status: string | null;
  auth_photos: string[];
  checkcheck_certificate_url: string | null;
  challenge_code: string | null;
  buyer_shipping_address: ShippingAddress | null;
  dispute_reason: string | null;
  dispute_evidence_buyer: string[];
  dispute_evidence_seller: string[];
  dispute_ruling: 'buyer' | 'seller' | null;
  review_rating: number | null;
  review_comment: string | null;
  shipping_deadline: string | null;
  review_deadline: string | null;
  created_at: string;
  updated_at: string;
  listing?: Listing;
  buyer?: User;
  seller?: User;
  custom_offer_id?: string;
}

// Conversation between buyer and seller
export interface Conversation {
  id: string;
  participant_ids: string[];
  listing_id: string | null;
  last_message: string | null;
  last_message_at: string | null;
  created_at: string;
}

// Message in a conversation
export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  message_type: 'text' | 'custom_offer' | 'offer_accepted' | 'offer_declined' | 'system';
  custom_offer_price?: number;
  custom_offer_status?: 'pending' | 'accepted' | 'declined';
  created_at: string;
  sender?: User;
}

// Seller application for verification
export interface SellerApplication {
  id: string;
  user_id: string;
  ship_from_address: ShippingAddress | null;
  questionnaire_responses: Record<string, string> | null;
  stripe_connected: boolean;
  terms_accepted: boolean;
  status: 'none' | 'pending' | 'approved' | 'rejected' | 'rejected_final';
  admin_notes: string | null;
  ai_recommendation: string | null;
  rejection_count: number;
  created_at: string;
  updated_at: string;
}

// Review for completed orders
export interface Review {
  id: string;
  order_id: string;
  reviewer_id: string;
  seller_id: string;
  rating: 1 | 2 | 3 | 4 | 5;
  comment?: string;
  created_at: string;
}

// Shipping address
export interface ShippingAddress {
  name: string;
  street: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
}

// Admin dispute view
export interface AdminDispute extends Order {
  dispute_reason: string;
  dispute_evidence_buyer: string[];
  dispute_evidence_seller: string[];
  dispute_ruling: 'buyer' | 'seller' | null;
}

// Paginated response wrapper
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}
