import type { SellerTier } from "@/types";

export interface TagBundle {
  id: string;
  name: string;
  quantity: number;
  priceCents: number;
  pricePerTag: string;
  minTier: SellerTier;
  description: string;
}

export const TAG_BUNDLES: TagBundle[] = [
  {
    id: "starter_100",
    name: "Starter",
    quantity: 100,
    priceCents: 1499,
    pricePerTag: "$0.15",
    minTier: "tier_1",
    description: "Great for new sellers getting started with Relay tags.",
  },
  {
    id: "growth_250",
    name: "Growth",
    quantity: 250,
    priceCents: 2499,
    pricePerTag: "$0.10",
    minTier: "tier_1",
    description: "Best value for active sellers scaling their operation.",
  },
  {
    id: "pro_500",
    name: "Pro",
    quantity: 500,
    priceCents: 3999,
    pricePerTag: "$0.08",
    minTier: "tier_2",
    description: "Unlocked at Tier 2. High-volume pricing for established sellers.",
  },
  {
    id: "enterprise_1000",
    name: "Enterprise",
    quantity: 1000,
    priceCents: 5999,
    pricePerTag: "$0.06",
    minTier: "tier_2",
    description: "Unlocked at Tier 2. Maximum volume at the lowest per-tag cost.",
  },
];

const TIER_RANK: Record<SellerTier, number> = {
  tier_1: 1,
  tier_2: 2,
  tier_3: 3,
};

export function getBundlesForTier(sellerTier: SellerTier): TagBundle[] {
  const rank = TIER_RANK[sellerTier] || 1;
  return TAG_BUNDLES.map((bundle) => ({
    ...bundle,
    locked: rank < TIER_RANK[bundle.minTier],
  })).filter(() => true) as TagBundle[];
}

export function isBundleUnlocked(bundle: TagBundle, sellerTier: SellerTier): boolean {
  return (TIER_RANK[sellerTier] || 1) >= TIER_RANK[bundle.minTier];
}

export function getBundleById(bundleId: string): TagBundle | undefined {
  return TAG_BUNDLES.find((b) => b.id === bundleId);
}

export function formatBundlePrice(priceCents: number): string {
  return `$${(priceCents / 100).toFixed(2)}`;
}
