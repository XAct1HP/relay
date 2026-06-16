import "server-only";

import type {
  ChainOfCustodyVerificationStatus,
  CheckCheckStatus,
  SellerTier,
  SellerTrustSnapshot,
} from "@/types/trust";

const SELLER_TRUST_WEIGHTS = {
  lifetimeGmv: 30,
  completedOrders: 25,
  accountAge: 15,
  disputeRate: 20,
  buyerCompletionRate: 10,
} as const;

const TRUST_SCORE_MAX = 100;
const TIER_3_GMV_CENTS = 5_000_000;
const TIER_3_COMPLETED_ORDERS = 100;
const TIER_3_ACCOUNT_AGE_DAYS = 180;
const HIGH_VALUE_CHECKCHECK_THRESHOLD_CENTS = 200_000;

export interface SellerTierEligibilityResult {
  trustScore: number;
  eligibleTier: SellerTier;
  manualOverrideApplied: boolean;
  adminApprovalRequired: boolean;
  reasons: string[];
  breakdown: {
    lifetimeGmv: number;
    completedOrders: number;
    accountAge: number;
    disputeRate: number;
    buyerCompletionRate: number;
  };
  hardThresholds: Record<SellerTier, { satisfied: boolean; reasons: string[] }>;
}

export interface CheckCheckRequirementInput {
  sellerTier: SellerTier;
  orderValueCents: number;
  isHighRiskSku?: boolean;
  hasRecentAuthenticityDispute?: boolean;
  randomAuditRequired?: boolean;
}

export interface CheckCheckRequirementResult {
  required: boolean;
  reason: string | null;
  status: CheckCheckStatus;
}

export interface ReservePolicy {
  sellerTier: SellerTier;
  reservePercentageBps: number;
  holdDurationDays: number | null;
  minimumReserveBalanceCents: number;
  releasePolicy: "buyer_confirmation_or_review_expiry" | "delivery" | "indefinite";
}

export interface PayoutPolicy {
  sellerTier: SellerTier;
  schedule: "buyer_confirmation_or_review_expiry" | "delivery" | "carrier_acceptance_and_delivery_split";
  releaseSteps: Array<{
    trigger: "buyer_confirmation" | "review_window_expiry" | "delivery" | "carrier_acceptance";
    percentageBps: number;
  }>;
}

export interface TagRequirementResult {
  required: boolean;
  mustBeUnique: boolean;
  gatingStep: "before_label_generation";
  reason: string;
}

export interface ChainOfCustodyInput {
  requiredTagValue?: string | null;
  expectedBarcodeValue?: string | null;
  sellerScannedTagValue?: string | null;
  buyerScannedTagValue?: string | null;
  sellerTagPhotoUrl?: string | null;
  sellerPairPhotoUrl?: string | null;
  sellerBoxPhotoUrl?: string | null;
  sellerSealedPackagePhotoUrl?: string | null;
  buyerTagPhotoUrl?: string | null;
  buyerPairPhotoUrl?: string | null;
  adminReviewRequired?: boolean;
}

export interface ChainOfCustodyResult {
  status: ChainOfCustodyVerificationStatus;
  mismatchReason: string | null;
  missingRequirements: string[];
  allSellerEvidencePresent: boolean;
  allBuyerEvidencePresent: boolean;
}

export const SELLER_TIER_THRESHOLDS = {
  tier_1: {
    completedOrders: 0,
    lifetimeGmvCents: 0,
    accountAgeDays: 0,
  },
  tier_2: {
    completedOrders: 20,
    lifetimeGmvCents: 750_000,
    accountAgeDays: 60,
    maxDisputeRateBps: 299,
    maxAuthenticityViolations: 0,
  },
  tier_3: {
    completedOrders: 100,
    lifetimeGmvCents: 5_000_000,
    accountAgeDays: 180,
    maxDisputeRateBps: 199,
    maxAuthenticityViolations: 0,
  },
} as const;

export function mapTrustScoreToTier(score: number): SellerTier {
  if (score >= 90) {
    return "tier_3";
  }

  if (score >= 60) {
    return "tier_2";
  }

  return "tier_1";
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function coerceDate(value?: string | Date | null) {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value : new Date(value);
}

function calculateAccountAgeDays(snapshot: Pick<SellerTrustSnapshot, "createdAt" | "sellerApprovedAt">) {
  const startDate = coerceDate(snapshot.sellerApprovedAt) || coerceDate(snapshot.createdAt);
  if (!startDate) {
    return 0;
  }

  const now = Date.now();
  return Math.max(0, Math.floor((now - startDate.getTime()) / (1000 * 60 * 60 * 24)));
}

function calculateDisputeRateBps(snapshot: Pick<SellerTrustSnapshot, "trailing180dOrderCount" | "trailing180dDisputeCount">) {
  if (snapshot.trailing180dOrderCount <= 0) {
    return 0;
  }

  return clamp(
    Math.round((snapshot.trailing180dDisputeCount * 10000) / snapshot.trailing180dOrderCount),
    0,
    10000
  );
}

function hasRecentAuthenticityViolation(
  snapshot: Pick<SellerTrustSnapshot, "lastAuthenticityViolationAt">,
  lookbackDays: number
) {
  const lastViolation = coerceDate(snapshot.lastAuthenticityViolationAt);
  if (!lastViolation) {
    return false;
  }

  const ageDays = Math.floor((Date.now() - lastViolation.getTime()) / (1000 * 60 * 60 * 24));
  return ageDays < lookbackDays;
}

/**
 * Weighted seller trust score.
 * The score intentionally tops out using the Tier 3 hard-threshold targets,
 * but promotions still require the explicit hard-threshold checks below.
 */
export function calculateSellerTrustScore(snapshot: SellerTrustSnapshot) {
  const accountAgeDays = calculateAccountAgeDays(snapshot);
  const disputeRateBps = calculateDisputeRateBps(snapshot);

  const gmvRatio = clamp(snapshot.lifetimeGmvCents / TIER_3_GMV_CENTS, 0, 1);
  const orderRatio = clamp(snapshot.completedOrderCount / TIER_3_COMPLETED_ORDERS, 0, 1);
  const ageRatio = clamp(accountAgeDays / TIER_3_ACCOUNT_AGE_DAYS, 0, 1);

  // 5% dispute rate is treated as the point where the dispute component bottoms out.
  const disputeRatio = clamp(1 - disputeRateBps / 500, 0, 1);
  const buyerCompletionRatio = clamp(snapshot.buyerCompletionRateBps / 10000, 0, 1);

  const weightedScore =
    gmvRatio * SELLER_TRUST_WEIGHTS.lifetimeGmv +
    orderRatio * SELLER_TRUST_WEIGHTS.completedOrders +
    ageRatio * SELLER_TRUST_WEIGHTS.accountAge +
    disputeRatio * SELLER_TRUST_WEIGHTS.disputeRate +
    buyerCompletionRatio * SELLER_TRUST_WEIGHTS.buyerCompletionRate;

  return clamp(Math.round(weightedScore), 0, TRUST_SCORE_MAX);
}

export function calculateSellerTrustScoreBreakdown(snapshot: SellerTrustSnapshot) {
  const accountAgeDays = calculateAccountAgeDays(snapshot);
  const disputeRateBps = calculateDisputeRateBps(snapshot);

  const breakdown = {
    lifetimeGmv: clamp(
      Math.round(clamp(snapshot.lifetimeGmvCents / TIER_3_GMV_CENTS, 0, 1) * SELLER_TRUST_WEIGHTS.lifetimeGmv),
      0,
      SELLER_TRUST_WEIGHTS.lifetimeGmv
    ),
    completedOrders: clamp(
      Math.round(clamp(snapshot.completedOrderCount / TIER_3_COMPLETED_ORDERS, 0, 1) * SELLER_TRUST_WEIGHTS.completedOrders),
      0,
      SELLER_TRUST_WEIGHTS.completedOrders
    ),
    accountAge: clamp(
      Math.round(clamp(accountAgeDays / TIER_3_ACCOUNT_AGE_DAYS, 0, 1) * SELLER_TRUST_WEIGHTS.accountAge),
      0,
      SELLER_TRUST_WEIGHTS.accountAge
    ),
    disputeRate: clamp(
      Math.round(clamp(1 - disputeRateBps / 500, 0, 1) * SELLER_TRUST_WEIGHTS.disputeRate),
      0,
      SELLER_TRUST_WEIGHTS.disputeRate
    ),
    buyerCompletionRate: clamp(
      Math.round(clamp(snapshot.buyerCompletionRateBps / 10000, 0, 1) * SELLER_TRUST_WEIGHTS.buyerCompletionRate),
      0,
      SELLER_TRUST_WEIGHTS.buyerCompletionRate
    ),
  };

  return {
    trustScore: clamp(
      breakdown.lifetimeGmv +
        breakdown.completedOrders +
        breakdown.accountAge +
        breakdown.disputeRate +
        breakdown.buyerCompletionRate,
      0,
      TRUST_SCORE_MAX
    ),
    breakdown,
    accountAgeDays,
    disputeRateBps,
  };
}

/**
 * Trust score remains useful for ranking and admin review, but Tier V2
 * promotions are driven by the explicit marketplace thresholds below.
 */
export function determineSellerTierEligibility(snapshot: SellerTrustSnapshot): SellerTierEligibilityResult {
  const {
    trustScore,
    breakdown,
    disputeRateBps,
    accountAgeDays,
  } = calculateSellerTrustScoreBreakdown(snapshot);

  const tier2Reasons: string[] = [];
  if (snapshot.completedOrderCount < SELLER_TIER_THRESHOLDS.tier_2.completedOrders) {
    tier2Reasons.push("completed orders below Tier 2 minimum");
  }
  if (snapshot.lifetimeGmvCents < SELLER_TIER_THRESHOLDS.tier_2.lifetimeGmvCents) {
    tier2Reasons.push("lifetime GMV below Tier 2 minimum");
  }
  if (accountAgeDays < SELLER_TIER_THRESHOLDS.tier_2.accountAgeDays) {
    tier2Reasons.push("account age below Tier 2 minimum");
  }
  if (disputeRateBps > SELLER_TIER_THRESHOLDS.tier_2.maxDisputeRateBps) {
    tier2Reasons.push("dispute rate too high for Tier 2");
  }
  if (snapshot.authenticityViolationCount > SELLER_TIER_THRESHOLDS.tier_2.maxAuthenticityViolations) {
    tier2Reasons.push("authenticity violations block Tier 2 promotion");
  }

  const tier3Reasons: string[] = [];
  if (snapshot.completedOrderCount < SELLER_TIER_THRESHOLDS.tier_3.completedOrders) {
    tier3Reasons.push("completed orders below Tier 3 minimum");
  }
  if (snapshot.lifetimeGmvCents < SELLER_TIER_THRESHOLDS.tier_3.lifetimeGmvCents) {
    tier3Reasons.push("lifetime GMV below Tier 3 minimum");
  }
  if (accountAgeDays < SELLER_TIER_THRESHOLDS.tier_3.accountAgeDays) {
    tier3Reasons.push("account age below Tier 3 minimum");
  }
  if (disputeRateBps > SELLER_TIER_THRESHOLDS.tier_3.maxDisputeRateBps) {
    tier3Reasons.push("dispute rate too high for Tier 3");
  }
  if (snapshot.authenticityViolationCount > SELLER_TIER_THRESHOLDS.tier_3.maxAuthenticityViolations) {
    tier3Reasons.push("authenticity violations block Tier 3 promotion");
  }

  const hardThresholds = {
    tier_1: { satisfied: true, reasons: [] as string[] },
    tier_2: { satisfied: tier2Reasons.length === 0, reasons: tier2Reasons },
    tier_3: { satisfied: tier3Reasons.length === 0, reasons: tier3Reasons },
  };

  if (snapshot.tierManuallyOverridden) {
    return {
      trustScore,
      eligibleTier: snapshot.sellerTier,
      manualOverrideApplied: true,
      adminApprovalRequired: false,
      reasons: ["manual tier override is active"],
      breakdown,
      hardThresholds,
    };
  }

  if (hardThresholds.tier_3.satisfied) {
    return {
      trustScore,
      eligibleTier: "tier_3",
      manualOverrideApplied: false,
      adminApprovalRequired: !snapshot.tier3ApprovedAt,
      reasons: [],
      breakdown,
      hardThresholds,
    };
  }

  if (hardThresholds.tier_2.satisfied) {
    return {
      trustScore,
      eligibleTier: "tier_2",
      manualOverrideApplied: false,
      adminApprovalRequired: false,
      reasons: [],
      breakdown,
      hardThresholds,
    };
  }

  return {
    trustScore,
    eligibleTier: "tier_1",
    manualOverrideApplied: false,
    adminApprovalRequired: false,
    reasons: [
      ...hardThresholds.tier_2.reasons,
      ...hardThresholds.tier_3.reasons,
    ],
    breakdown,
    hardThresholds,
  };
}

/**
 * Tier 1 and Tier 2 always require CheckCheck.
 * Tier 3 is waived by default, but re-enabled for high-value / high-risk /
 * authenticity-risk / random-audit orders.
 */
export function determineCheckCheckRequirement(
  input: CheckCheckRequirementInput
): CheckCheckRequirementResult {
  if (input.sellerTier === "tier_1" || input.sellerTier === "tier_2") {
    return {
      required: true,
      reason: "seller tier requires CheckCheck on every order",
      status: "required",
    };
  }

  if (input.orderValueCents > HIGH_VALUE_CHECKCHECK_THRESHOLD_CENTS) {
    return {
      required: true,
      reason: "order value exceeds Tier 3 CheckCheck threshold",
      status: "required",
    };
  }

  if (input.isHighRiskSku) {
    return {
      required: true,
      reason: "high-risk SKU requires CheckCheck",
      status: "required",
    };
  }

  if (input.hasRecentAuthenticityDispute) {
    return {
      required: true,
      reason: "seller authenticity dispute history requires CheckCheck",
      status: "required",
    };
  }

  if (input.randomAuditRequired) {
    return {
      required: true,
      reason: "random audit requires CheckCheck",
      status: "required",
    };
  }

  return {
    required: false,
    reason: null,
    status: "not_required",
  };
}

export function determineReservePolicyForTier(sellerTier: SellerTier): ReservePolicy {
  // Tier V2 removes fixed reserve percentages and the old minimum platform
  // balance requirement. Relay Balance + exposure holds now handle risk.
  return {
    sellerTier,
    reservePercentageBps: 0,
    holdDurationDays: null,
    minimumReserveBalanceCents: 0,
    releasePolicy:
      sellerTier === "tier_1"
        ? "buyer_confirmation_or_review_expiry"
        : "delivery",
  };
}

export function determinePayoutPolicyForTier(sellerTier: SellerTier): PayoutPolicy {
  if (sellerTier === "tier_3") {
    return {
      sellerTier,
      schedule: "carrier_acceptance_and_delivery_split",
      releaseSteps: [
        { trigger: "carrier_acceptance", percentageBps: 5000 },
        { trigger: "delivery", percentageBps: 5000 },
      ],
    };
  }

  if (sellerTier === "tier_2") {
    return {
      sellerTier,
      schedule: "delivery",
      releaseSteps: [{ trigger: "delivery", percentageBps: 10000 }],
    };
  }

  return {
    sellerTier,
    schedule: "buyer_confirmation_or_review_expiry",
    releaseSteps: [
      { trigger: "buyer_confirmation", percentageBps: 10000 },
      { trigger: "review_window_expiry", percentageBps: 10000 },
    ],
  };
}

export function determineTagRequirementForOrder(): TagRequirementResult {
  return {
    required: true,
    mustBeUnique: true,
    gatingStep: "before_label_generation",
    reason: "every Relay order must bind to a unique Relay security tag before shipping",
  };
}

function normalizeTagValue(value?: string | null) {
  return (value || "").trim().toUpperCase();
}

/**
 * Chain-of-custody verification is deliberately strict:
 * the seller-side package evidence must be complete before label creation, and
 * buyer-side evidence must confirm the same tag after delivery.
 */
export function evaluateOrderChainOfCustodyStatus(
  input: ChainOfCustodyInput
): ChainOfCustodyResult {
  const missingRequirements: string[] = [];

  if (!input.sellerScannedTagValue) {
    missingRequirements.push("seller_scanned_tag_value");
  }
  if (!input.sellerTagPhotoUrl) {
    missingRequirements.push("seller_tag_photo_url");
  }
  if (!input.sellerPairPhotoUrl) {
    missingRequirements.push("seller_pair_photo_url");
  }
  if (!input.sellerBoxPhotoUrl) {
    missingRequirements.push("seller_box_photo_url");
  }
  if (!input.sellerSealedPackagePhotoUrl) {
    missingRequirements.push("seller_sealed_package_photo_url");
  }

  const allSellerEvidencePresent =
    !missingRequirements.some((requirement) => requirement.startsWith("seller_"));

  const buyerMissing: string[] = [];
  if (!input.buyerScannedTagValue) {
    buyerMissing.push("buyer_scanned_tag_value");
  }
  if (!input.buyerTagPhotoUrl) {
    buyerMissing.push("buyer_tag_photo_url");
  }
  if (!input.buyerPairPhotoUrl) {
    buyerMissing.push("buyer_pair_photo_url");
  }

  const allBuyerEvidencePresent = buyerMissing.length === 0;
  missingRequirements.push(...buyerMissing);

  if (input.adminReviewRequired) {
    return {
      status: "admin_review",
      mismatchReason: null,
      missingRequirements,
      allSellerEvidencePresent,
      allBuyerEvidencePresent,
    };
  }

  if (!allSellerEvidencePresent) {
    return {
      status: "pending",
      mismatchReason: null,
      missingRequirements,
      allSellerEvidencePresent,
      allBuyerEvidencePresent,
    };
  }

  const expectedValues = [normalizeTagValue(input.requiredTagValue), normalizeTagValue(input.expectedBarcodeValue)]
    .filter(Boolean);
  const sellerValue = normalizeTagValue(input.sellerScannedTagValue);
  const buyerValue = normalizeTagValue(input.buyerScannedTagValue);

  if (expectedValues.length > 0 && sellerValue && !expectedValues.includes(sellerValue)) {
    return {
      status: "mismatch",
      mismatchReason: "seller scanned tag does not match the assigned Relay tag",
      missingRequirements,
      allSellerEvidencePresent,
      allBuyerEvidencePresent,
    };
  }

  if (buyerValue && sellerValue && buyerValue !== sellerValue && !expectedValues.includes(buyerValue)) {
    return {
      status: "mismatch",
      mismatchReason: "buyer scanned tag does not match the seller-submitted Relay tag",
      missingRequirements,
      allSellerEvidencePresent,
      allBuyerEvidencePresent,
    };
  }

  if (!allBuyerEvidencePresent) {
    return {
      status: "submitted",
      mismatchReason: null,
      missingRequirements,
      allSellerEvidencePresent,
      allBuyerEvidencePresent,
    };
  }

  return {
    status: "verified",
    mismatchReason: null,
    missingRequirements,
    allSellerEvidencePresent,
    allBuyerEvidencePresent,
  };
}
