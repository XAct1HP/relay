export interface RelayTestMarketplaceListing {
  id: string;
  brand: string;
  model: string;
  nickname?: string;
  condition: "New" | "Used" | "New + Used";
  boxCondition: "New" | "Good" | "Fair" | "Poor" | "No Box";
  description: string;
  images: string[];
  seller: {
    username: string;
    displayName: string;
    avatar: string;
    isVerified: boolean;
    totalSales: number;
    rating: number;
    joinedDate: string;
  };
  sizes: Array<{
    id: string;
    size: number;
    quantity: number;
    price: number;
    condition?: "new" | "used";
  }>;
  gradient: string;
  createdAt: string;
}

const RELAY_PREVIEW_SELLER = {
  username: "relay-preview",
  displayName: "Relay Preview Seller",
  avatar: "https://api.dicebear.com/7.x/shapes/svg?seed=relay-preview",
  isVerified: true,
  totalSales: 128,
  rating: 4.9,
  joinedDate: "January 2026",
} as const;

const PLACEHOLDER_LISTINGS: RelayTestMarketplaceListing[] = [
  {
    id: "test-placeholder-chicago",
    brand: "Jordan",
    model: "Air Jordan 1 Retro High OG",
    nickname: "Chicago Reimagined",
    condition: "New",
    boxCondition: "New",
    description:
      "Preview catalog listing for staging. This placeholder lets you review the card layout, image gallery, size selector, and pricing presentation before live inventory is connected.",
    images: [
      "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1600185365483-26d7a4cc7519?auto=format&fit=crop&w=1200&q=80",
    ],
    seller: RELAY_PREVIEW_SELLER,
    sizes: [
      { id: "test-placeholder-chicago-8", size: 8, quantity: 1, price: 225 },
      { id: "test-placeholder-chicago-9", size: 9, quantity: 2, price: 230 },
      { id: "test-placeholder-chicago-10", size: 10, quantity: 0, price: 235 },
      { id: "test-placeholder-chicago-11", size: 11, quantity: 1, price: 240 },
    ],
    gradient: "from-red-500/20 to-orange-500/20",
    createdAt: "2026-06-01T12:00:00.000Z",
  },
  {
    id: "test-placeholder-yeezy",
    brand: "Adidas",
    model: "Yeezy Boost 350 V2",
    nickname: "Onyx",
    condition: "Used",
    boxCondition: "Good",
    description:
      "Preview listing with a broader size spread and used condition styling. Great for checking how price sorting and size summaries behave with multiple active variants.",
    images: [
      "https://images.unsplash.com/photo-1518002171953-a080ee817e1f?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1491553895911-0055eca6402d?auto=format&fit=crop&w=1200&q=80",
    ],
    seller: RELAY_PREVIEW_SELLER,
    sizes: [
      { id: "test-placeholder-yeezy-9", size: 9, quantity: 1, price: 180 },
      { id: "test-placeholder-yeezy-9_5", size: 9.5, quantity: 1, price: 185 },
      { id: "test-placeholder-yeezy-10", size: 10, quantity: 2, price: 190 },
      { id: "test-placeholder-yeezy-10_5", size: 10.5, quantity: 0, price: 195 },
    ],
    gradient: "from-gray-600/20 to-slate-600/20",
    createdAt: "2026-05-29T12:00:00.000Z",
  },
  {
    id: "test-placeholder-custom",
    brand: "Custom",
    model: "Hand-Painted Dunk Low",
    nickname: "Sunset Splash",
    condition: "Used",
    boxCondition: "No Box",
    description:
      "Preview manual listing for staging. This one is here to make sure custom and independent-brand style cards still look right next to SKU-based listings.",
    images: [
      "https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?auto=format&fit=crop&w=1200&q=80",
    ],
    seller: RELAY_PREVIEW_SELLER,
    sizes: [
      { id: "test-placeholder-custom-9", size: 9, quantity: 1, price: 320 },
    ],
    gradient: "from-purple-500/20 to-pink-500/20",
    createdAt: "2026-05-25T12:00:00.000Z",
  },
];

export function getRelayTestMarketplaceListings() {
  return PLACEHOLDER_LISTINGS;
}

export function getRelayTestMarketplaceListing(id: string) {
  return PLACEHOLDER_LISTINGS.find((listing) => listing.id === id) || null;
}
