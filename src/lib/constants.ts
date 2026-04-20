/**
 * Popular shoe brands
 */
export const BRANDS = [
  'Nike',
  'Adidas',
  'Puma',
  'New Balance',
  'Reebok',
  'Asics',
  'Salomon',
  'The North Face',
  'Timberland',
  'Vans',
  'Converse',
  'Jordan',
  'Air Jordan',
  'Yeezy',
  'Gucci',
  'Louis Vuitton',
  'Balenciaga',
  'Dior',
  'Prada',
  'Valentino',
  'Jimmy Choo',
  'Versace',
  'Alexander McQueen',
  'Common Projects',
  'Golden Goose',
  'ASICS',
  'Diadora',
  'Fila',
  'Saucony',
  'Mizuno',
  'Brooks',
  'Keen',
  'Merrell',
  'Columbia',
  'Skechers',
  'Crocs',
  'UGG',
  'Dr. Martens',
  'Clarks',
  'Cole Haan',
  'Allen Edmonds',
  'Other / Independent Brand',
];

/**
 * Shoe condition options
 */
export const CONDITIONS = {
  new: { label: 'New', description: 'Never worn, original box and tags' },
  like_new: { label: 'Like New', description: 'Worn once or twice, minimal wear' },
  used_excellent: {
    label: 'Used - Excellent',
    description: 'Light wear, well maintained',
  },
  used_good: { label: 'Used - Good', description: 'Moderate wear, still in great condition' },
  used_fair: { label: 'Used - Fair', description: 'Noticeable wear, still wearable' },
} as const;

/**
 * Box condition options
 */
export const BOX_CONDITIONS = {
  perfect: { label: 'Perfect', description: 'No damage or wear' },
  good: { label: 'Good', description: 'Minor damage or wear' },
  damaged: { label: 'Damaged', description: 'Significant damage' },
  no_box: { label: 'No Box', description: 'Original box not included' },
} as const;

/**
 * Approximate sizing/weight options
 */
export const APPROX_SIZINGS = {
  lightweight: { label: 'Lightweight', description: 'Under 300g per shoe' },
  normal: { label: 'Normal', description: '300g - 500g per shoe' },
  heavy: { label: 'Heavy', description: 'Over 500g per shoe' },
} as const;

/**
 * Available shoe sizes (US Men's)
 */
export const SHOE_SIZES = [
  '3.5',
  '4',
  '4.5',
  '5',
  '5.5',
  '6',
  '6.5',
  '7',
  '7.5',
  '8',
  '8.5',
  '9',
  '9.5',
  '10',
  '10.5',
  '11',
  '11.5',
  '12',
  '12.5',
  '13',
  '13.5',
  '14',
  '14.5',
  '15',
  '15.5',
  '16',
  '16.5',
  '17',
  '17.5',
  '18',
];

/**
 * Order status options with labels and descriptions
 */
export const ORDER_STATUSES = {
  pending_payment: {
    label: 'Pending Payment',
    description: 'Awaiting buyer payment',
    color: 'yellow',
  },
  paid: {
    label: 'Payment Confirmed',
    description: 'Payment received, preparing shipment',
    color: 'blue',
  },
  auth_submitted: {
    label: 'Authentication Submitted',
    description: 'Awaiting authentication results',
    color: 'purple',
  },
  label_created: {
    label: 'Shipping Label Created',
    description: 'Ready to ship',
    color: 'cyan',
  },
  shipped: {
    label: 'Shipped',
    description: 'In transit to buyer',
    color: 'indigo',
  },
  delivered: {
    label: 'Delivered',
    description: 'Delivered to buyer',
    color: 'teal',
  },
  review_window: {
    label: 'Review Window',
    description: 'Buyer can submit review',
    color: 'orange',
  },
  completed: {
    label: 'Completed',
    description: 'Order completed successfully',
    color: 'green',
  },
  disputed: {
    label: 'Disputed',
    description: 'Order under dispute',
    color: 'red',
  },
  cancelled: {
    label: 'Cancelled',
    description: 'Order cancelled',
    color: 'gray',
  },
  refund_pending: {
    label: 'Refund Pending',
    description: 'Refund in progress',
    color: 'amber',
  },
  refunded: {
    label: 'Refunded',
    description: 'Refund completed',
    color: 'gray',
  },
} as const;

/**
 * Shipping buffer amount (in dollars)
 */
export const SHIPPING_BUFFER = 1.5;

/**
 * Platform fee rate (percentage)
 */
export const PLATFORM_FEE_RATE = 0.01;

/**
 * Stripe fee rate (percentage)
 */
export const STRIPE_FEE_RATE = 0.03;

/**
 * Stripe fixed fee (in dollars)
 */
export const STRIPE_FEE_FIXED = 0.3;

/**
 * Number of days seller has to ship an order
 */
export const SELLER_SHIPPING_DEADLINE_DAYS = 5;

/**
 * Number of hours buyer has to submit a review after delivery
 */
export const BUYER_REVIEW_WINDOW_HOURS = 48;

/**
 * Maximum number of rejection attempts for seller application
 */
export const MAX_REJECTION_ATTEMPTS = 2;

/**
 * Default items per page for pagination
 */
export const ITEMS_PER_PAGE = 20;
