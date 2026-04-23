/**
 * Special brand categories (shown first, require admin approval)
 */
export const SPECIAL_BRANDS = ['Individual Brand', 'Custom'] as const;

/**
 * Brands that require admin review before going live
 */
export const BRANDS_REQUIRING_REVIEW = new Set<string>([...SPECIAL_BRANDS]);

/**
 * Popular shoe brands — comprehensive list
 */
export const BRANDS = [
  // --- Special categories (top) ---
  'Individual Brand',
  'Custom',
  // --- Major athletic / streetwear ---
  'Nike',
  'Jordan',
  'Air Jordan',
  'Adidas',
  'Yeezy',
  'New Balance',
  'Puma',
  'Reebok',
  'Converse',
  'Vans',
  'ASICS',
  'Saucony',
  'Brooks',
  'Mizuno',
  'Fila',
  'Diadora',
  'Hoka',
  'On Running',
  'Salomon',
  'Under Armour',
  'Li-Ning',
  'Anta',
  'K-Swiss',
  'Karhu',
  'Etonic',
  'Altra',
  // --- Luxury / designer ---
  'Gucci',
  'Louis Vuitton',
  'Balenciaga',
  'Dior',
  'Prada',
  'Valentino',
  'Versace',
  'Alexander McQueen',
  'Bottega Veneta',
  'Givenchy',
  'Saint Laurent',
  'Burberry',
  'Fendi',
  'Maison Margiela',
  'Lanvin',
  'Amiri',
  'Off-White',
  'Palm Angels',
  'Fear of God',
  'Rick Owens',
  'Comme des Garçons',
  'Acne Studios',
  'Loewe',
  'Miu Miu',
  'Celine',
  'Hermès',
  'Chanel',
  'Tom Ford',
  'Balmain',
  'Dolce & Gabbana',
  'Salvatore Ferragamo',
  'Jimmy Choo',
  'Christian Louboutin',
  'Manolo Blahnik',
  'Stuart Weitzman',
  'Giuseppe Zanotti',
  'Roger Vivier',
  // --- Premium sneaker / hype ---
  'Common Projects',
  'Golden Goose',
  'Axel Arigato',
  'Filling Pieces',
  'Y-3',
  'A Bathing Ape (BAPE)',
  'Sacai',
  'Stüssy',
  'Supreme',
  'Travis Scott',
  'Kith',
  'Rhude',
  'Casablanca',
  'Represent',
  'A-COLD-WALL*',
  'Stone Island',
  'New Rock',
  // --- Heritage / classic ---
  'Dr. Martens',
  'Clarks',
  'Birkenstock',
  'Red Wing',
  'Wolverine',
  'Thorogood',
  'Alden',
  'Allen Edmonds',
  'Church\'s',
  'Grenson',
  'Tricker\'s',
  'Cole Haan',
  'Johnston & Murphy',
  'Florsheim',
  'Bass',
  'Sperry',
  'Sebago',
  // --- Lifestyle / casual ---
  'Skechers',
  'Crocs',
  'UGG',
  'Timberland',
  'Palladium',
  'Superga',
  'Tretorn',
  'Keds',
  'Toms',
  'Hey Dude',
  'Native Shoes',
  'Allbirds',
  'Cariuma',
  'Veja',
  'Gola',
  'Feiyue',
  'Lacoste',
  'Fred Perry',
  'Camper',
  'Ecco',
  'Geox',
  // --- Outdoor / trail ---
  'The North Face',
  'Columbia',
  'Keen',
  'Merrell',
  'Danner',
  'Vasque',
  'La Sportiva',
  'Scarpa',
  'Arc\'teryx',
  'Oboz',
  'Lowa',
  // --- Skate ---
  'DC Shoes',
  'Etnies',
  'éS',
  'Lakai',
  'Globe',
  'Emerica',
  'Osiris',
  'DVS',
  // --- Other ---
  'New Rock',
  'Naked Wolfe',
  'Steve Madden',
  'Aldo',
  'Call It Spring',
  'Zara',
  'H&M',
  'Other',
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
  payout_failed: {
    label: 'Payout Failed',
    description: 'Seller payout failed — needs admin attention',
    color: 'red',
  },
  return_pending: {
    label: 'Return Required',
    description: 'Buyer needs to ship the item back',
    color: 'amber',
  },
  return_shipped: {
    label: 'Return Shipped',
    description: 'Return package is in transit',
    color: 'cyan',
  },
  return_delivered: {
    label: 'Return Received',
    description: 'Return received, refund being processed',
    color: 'green',
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
