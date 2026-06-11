import type { DisputeCategory } from "@/types";

export const BUYER_DISPUTE_CATEGORIES: DisputeCategory[] = [
  "authenticity",
  "condition_not_as_listed",
  "wrong_item",
  "tampered_tag",
  "missing_contents",
  "shipping_damage",
];

export interface BuyerDisputeCategoryRule {
  label: string;
  description: string;
  requiresExplanation: boolean;
  explanationPlaceholder: string;
  requiresBuyerTagScan: boolean;
  requiresBuyerTagPhoto: boolean;
  requiresBuyerPairPhoto: boolean;
  minimumUploadedEvidenceCount: number;
}

export const BUYER_DISPUTE_CATEGORY_RULES: Record<
  DisputeCategory,
  BuyerDisputeCategoryRule
> = {
  authenticity: {
    label: "Authenticity",
    description:
      "Requires the Relay tag scan, tag photo, pair photo, and an explanation of the concern.",
    requiresExplanation: true,
    explanationPlaceholder:
      "Explain why you believe the item may not be authentic.",
    requiresBuyerTagScan: true,
    requiresBuyerTagPhoto: true,
    requiresBuyerPairPhoto: true,
    minimumUploadedEvidenceCount: 0,
  },
  condition_not_as_listed: {
    label: "Condition Not As Listed",
    description:
      "Requires photos of the pair and an explanation of how the item differs from the listing.",
    requiresExplanation: true,
    explanationPlaceholder:
      "Describe the condition issue and how it differs from the listing.",
    requiresBuyerTagScan: false,
    requiresBuyerTagPhoto: false,
    requiresBuyerPairPhoto: true,
    minimumUploadedEvidenceCount: 0,
  },
  wrong_item: {
    label: "Wrong Item / SKU / Size",
    description:
      "Requires photo evidence showing the incorrect SKU, size, or item details.",
    requiresExplanation: true,
    explanationPlaceholder:
      "Describe what was received and why it does not match the order.",
    requiresBuyerTagScan: false,
    requiresBuyerTagPhoto: false,
    requiresBuyerPairPhoto: false,
    minimumUploadedEvidenceCount: 1,
  },
  tampered_tag: {
    label: "Tampered Tag",
    description:
      "Requires a close-up photo showing the damaged or tampered Relay security tag.",
    requiresExplanation: true,
    explanationPlaceholder:
      "Describe how the Relay tag appears tampered, damaged, or altered.",
    requiresBuyerTagScan: false,
    requiresBuyerTagPhoto: false,
    requiresBuyerPairPhoto: false,
    minimumUploadedEvidenceCount: 1,
  },
  missing_contents: {
    label: "Missing Package Contents",
    description:
      "Requires box or package photos showing the missing contents issue.",
    requiresExplanation: true,
    explanationPlaceholder:
      "Describe what was missing when the package was opened.",
    requiresBuyerTagScan: false,
    requiresBuyerTagPhoto: false,
    requiresBuyerPairPhoto: false,
    minimumUploadedEvidenceCount: 1,
  },
  shipping_damage: {
    label: "Shipping Damage / Carrier Issue",
    description:
      "Requires package photos showing the shipping damage or carrier issue.",
    requiresExplanation: true,
    explanationPlaceholder:
      "Describe the damage or carrier issue you observed on delivery.",
    requiresBuyerTagScan: false,
    requiresBuyerTagPhoto: false,
    requiresBuyerPairPhoto: false,
    minimumUploadedEvidenceCount: 1,
  },
};

export function isBuyerDisputeCategory(value: string): value is DisputeCategory {
  return BUYER_DISPUTE_CATEGORIES.includes(value as DisputeCategory);
}
