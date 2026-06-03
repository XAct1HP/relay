export const RELAY_TEST_SELLER_EMAIL = "test-seller@relay.local";

export const RELAY_TEST_ADDRESS = {
  name: "Relay Test Seller",
  street: "123 Preview Lane",
  street2: "Suite 100",
  city: "New York",
  state: "NY",
  zip: "10001",
  country: "United States",
} as const;

export const RELAY_TEST_QUESTIONNAIRE = {
  primary_shoe_type: "authenticated_sneakers",
  reselling_duration: "5 years selling premium sneakers across multiple platforms.",
  previous_platforms: "StockX, eBay, GOAT, Grailed, Instagram.",
  authenticity_verification:
    "I verify SKU, materials, box labels, stitching, shape, and purchase history, and I only list inventory I can confidently authenticate.",
  monthly_volume: "25-40 listings per month.",
  why_relay:
    "Relay's community-first marketplace and direct buyer communication fit how I want to build a trusted seller presence.",
  own_brand: "No current in-house brand. Focused on authentic sneaker resale for testing.",
  instagram_url: "https://instagram.com/relay_test_seller",
  other_links: "https://example.com/relay-test-seller-history",
} as const;

export function isRelayTestModeEnabled() {
  return process.env.RELAY_TEST_MODE === "true" && process.env.VERCEL_ENV !== "production";
}

export function isRelayTestSellerEmail(email?: string | null) {
  return (email || "").trim().toLowerCase() === RELAY_TEST_SELLER_EMAIL;
}

export function buildFallbackUsername(email?: string | null) {
  const base = (email || "relay_user")
    .toLowerCase()
    .replace(/@.*$/, "")
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 12) || "relayuser";

  return `${base}_${Math.random().toString(36).slice(2, 8)}`;
}
