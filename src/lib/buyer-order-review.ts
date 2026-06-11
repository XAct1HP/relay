import "server-only";

import { evaluateOrderChainOfCustodyStatus } from "@/lib/seller-trust";
import {
  BUYER_DISPUTE_CATEGORY_RULES,
  isBuyerDisputeCategory,
} from "@/lib/order-disputes";
import { isLegacyOrderAuthFlow } from "@/lib/order-auth";
import { logRelayAuditEvent } from "@/lib/relay-audit";
import type { DisputeCategory, OrderChainOfCustody } from "@/types";

type SupabaseAdminClient = ReturnType<
  typeof import("@/lib/supabase-admin").createAdminClient
>;

const ACTIVE_DISPUTE_STATUSES = new Set([
  "open",
  "seller_responded",
  "under_review",
]);

interface RelayTagRecord {
  id: string;
  tag_serial_number: string | null;
  barcode_value: string | null;
  status: string | null;
}

interface OrderDisputeRow {
  id: string;
  category: DisputeCategory;
  status: string;
  buyer_description: string | null;
  buyer_evidence_urls: string[] | null;
  buyer_scanned_tag_value: string | null;
  seller_funds_frozen: boolean;
}

interface BuyerOrderReviewContext {
  id: string;
  buyer_id: string;
  seller_id: string;
  status: string;
  review_deadline: string | null;
  seller_funds_frozen: boolean;
  relay_tag_required: boolean | null;
  relay_tag_id: string | null;
  auth_requirements_evaluated_at: string | null;
  order_chain_of_custody: OrderChainOfCustody | OrderChainOfCustody[] | null;
  relay_tag: RelayTagRecord | RelayTagRecord[] | null;
  order_disputes: OrderDisputeRow[] | OrderDisputeRow | null;
}

export interface BuyerCompletionEligibility {
  canComplete: boolean;
  canAutoComplete: boolean;
  blockedReasons: string[];
  autoCompleteBlockedReasons: string[];
  reviewWindowExpired: boolean;
  legacyFlow: boolean;
  requiresBuyerCustody: boolean;
  hasActiveDispute: boolean;
  expectedTagValue: string | null;
  expectedBarcodeValue: string | null;
  chainStatus: ReturnType<typeof evaluateOrderChainOfCustodyStatus>;
  currentDispute: OrderDisputeRow | null;
  custodyRecord: OrderChainOfCustody | null;
}

export interface BuyerDisputeInput {
  category: string;
  description: string;
  evidenceUrls?: string[] | null;
}

export interface NormalizedBuyerDisputeInput {
  category: DisputeCategory;
  description: string;
  evidenceUrls: string[];
}

function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function normalizeValue(value?: string | null) {
  return (value || "").trim().toUpperCase();
}

export function getActiveOrderDispute(
  disputes: OrderDisputeRow[] | OrderDisputeRow | null | undefined
) {
  return asArray(disputes).find((dispute) =>
    ACTIVE_DISPUTE_STATUSES.has(dispute.status)
  ) || null;
}

export async function loadBuyerOrderReviewContext(
  adminClient: SupabaseAdminClient,
  orderId: string
) {
  const { data, error } = await adminClient
    .from("orders")
    .select(`
      id,
      buyer_id,
      seller_id,
      status,
      review_deadline,
      seller_funds_frozen,
      relay_tag_required,
      relay_tag_id,
      auth_requirements_evaluated_at,
      relay_tag:relay_tags!orders_relay_tag_id_fkey(
        id,
        tag_serial_number,
        barcode_value,
        status
      ),
      order_chain_of_custody(*),
      order_disputes(
        id,
        category,
        status,
        buyer_description,
        buyer_evidence_urls,
        buyer_scanned_tag_value,
        seller_funds_frozen
      )
    `)
    .eq("id", orderId)
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Order not found");
  }

  return data as BuyerOrderReviewContext;
}

export function evaluateBuyerCompletionEligibility(
  context: BuyerOrderReviewContext
): BuyerCompletionEligibility {
  const custodyRecord = asArray(context.order_chain_of_custody)[0] || null;
  const relayTag = asArray(context.relay_tag)[0] || null;
  const legacyFlow = isLegacyOrderAuthFlow({
    auth_requirements_evaluated_at: context.auth_requirements_evaluated_at,
    relay_tag_id: context.relay_tag_id,
    order_chain_of_custody: null,
  });
  const requiresBuyerCustody = !legacyFlow && Boolean(context.relay_tag_required);
  const currentDispute = getActiveOrderDispute(context.order_disputes);
  const hasActiveDispute = Boolean(currentDispute);
  const reviewWindowExpired = context.review_deadline
    ? new Date(context.review_deadline).getTime() <= Date.now()
    : false;

  const chainStatus = evaluateOrderChainOfCustodyStatus({
    requiredTagValue: relayTag?.tag_serial_number || null,
    expectedBarcodeValue: relayTag?.barcode_value || null,
    sellerScannedTagValue: custodyRecord?.seller_scanned_tag_value || null,
    buyerScannedTagValue: custodyRecord?.buyer_scanned_tag_value || null,
    sellerTagPhotoUrl: custodyRecord?.seller_tag_photo_url || null,
    sellerPairPhotoUrl: custodyRecord?.seller_pair_photo_url || null,
    sellerBoxPhotoUrl: custodyRecord?.seller_box_photo_url || null,
    sellerSealedPackagePhotoUrl:
      custodyRecord?.seller_sealed_package_photo_url || null,
    buyerTagPhotoUrl: custodyRecord?.buyer_tag_photo_url || null,
    buyerPairPhotoUrl: custodyRecord?.buyer_pair_photo_url || null,
    adminReviewRequired: Boolean(custodyRecord?.admin_review_required),
  });

  const blockedReasons: string[] = [];
  const autoCompleteBlockedReasons: string[] = [];

  if (!["delivered", "review_window"].includes(context.status)) {
    blockedReasons.push("Order must be delivered before it can be completed.");
    autoCompleteBlockedReasons.push(
      "Order is not in a deliverable review state for auto-completion."
    );
  }

  if (hasActiveDispute) {
    blockedReasons.push("An active dispute is already open for this order.");
    autoCompleteBlockedReasons.push(
      "An active dispute is open, so the order cannot auto-complete."
    );
  }

  if (context.seller_funds_frozen) {
    blockedReasons.push(
      "Seller funds are currently frozen while this order is under review."
    );
    autoCompleteBlockedReasons.push(
      "Seller funds are frozen, so auto-complete is paused."
    );
  }

  if (requiresBuyerCustody) {
    if (!context.relay_tag_id || !relayTag) {
      blockedReasons.push(
        "Relay tag assignment is missing, so buyer verification cannot be completed."
      );
      autoCompleteBlockedReasons.push(
        "Relay tag assignment is missing and requires admin review."
      );
    }

    if (chainStatus.status === "mismatch") {
      blockedReasons.push(
        chainStatus.mismatchReason ||
          "Your scanned Relay tag does not match the order tag."
      );
      autoCompleteBlockedReasons.push(
        "Relay chain-of-custody mismatch requires admin review."
      );
    } else if (chainStatus.status === "admin_review") {
      blockedReasons.push(
        "Relay chain-of-custody evidence is waiting on admin review."
      );
      autoCompleteBlockedReasons.push(
        "Relay chain-of-custody evidence is waiting on admin review."
      );
    } else if (chainStatus.status === "pending") {
      blockedReasons.push(
        "Seller chain-of-custody evidence is incomplete or not verified yet."
      );
      autoCompleteBlockedReasons.push(
        "Seller chain-of-custody evidence is incomplete or not verified yet."
      );
    } else if (!chainStatus.allBuyerEvidencePresent) {
      blockedReasons.push(
        "Buyer tag scan, tag photo, and pair photo are required before completing the order."
      );
    }
  }

  return {
    canComplete: blockedReasons.length === 0,
    canAutoComplete: autoCompleteBlockedReasons.length === 0,
    blockedReasons,
    autoCompleteBlockedReasons,
    reviewWindowExpired,
    legacyFlow,
    requiresBuyerCustody,
    hasActiveDispute,
    expectedTagValue: relayTag?.tag_serial_number || null,
    expectedBarcodeValue: relayTag?.barcode_value || null,
    chainStatus,
    currentDispute,
    custodyRecord,
  };
}

export async function markBuyerCustodyVerified(
  adminClient: SupabaseAdminClient,
  input: {
    orderId: string;
    sellerId: string;
    actorUserId: string;
  }
) {
  const nowIso = new Date().toISOString();

  await adminClient
    .from("order_chain_of_custody")
    .update({
      verification_status: "verified",
      mismatch_reason: null,
      admin_review_required: false,
      verified_at: nowIso,
      updated_at: nowIso,
    })
    .eq("order_id", input.orderId);

  await logRelayAuditEvent(adminClient, {
    actorUserId: input.actorUserId,
    actorRole: "buyer",
    orderId: input.orderId,
    sellerId: input.sellerId,
    eventType: "order.custody_buyer_verified",
    metadata: {},
  });
}

export async function markOrderTagCompleted(
  adminClient: SupabaseAdminClient,
  input: {
    relayTagId: string | null;
    orderId: string;
  }
) {
  if (!input.relayTagId) {
    return;
  }

  await adminClient
    .from("relay_tags")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
    })
    .eq("id", input.relayTagId);
}

export function normalizeBuyerDisputeInput(
  input: BuyerDisputeInput
): NormalizedBuyerDisputeInput {
  const category = String(input.category || "").trim();
  if (!isBuyerDisputeCategory(category)) {
    throw new Error("Invalid dispute category");
  }

  const description = String(input.description || "").trim();
  if (!description) {
    throw new Error("A dispute explanation is required");
  }

  const evidenceUrls = Array.isArray(input.evidenceUrls)
    ? input.evidenceUrls.filter(
        (value): value is string => typeof value === "string" && value.trim().length > 0
      )
    : [];

  return {
    category,
    description,
    evidenceUrls,
  };
}

export function validateBuyerDisputeRequirements(input: {
  category: DisputeCategory;
  description: string;
  evidenceUrls: string[];
  custodyRecord: OrderChainOfCustody | null;
}) {
  const rule = BUYER_DISPUTE_CATEGORY_RULES[input.category];
  const missing: string[] = [];
  const description = input.description.trim();

  if (rule.requiresExplanation && !description) {
    missing.push("explanation");
  }

  if (rule.requiresBuyerTagScan && !input.custodyRecord?.buyer_scanned_tag_value) {
    missing.push("buyer tag scan");
  }

  if (rule.requiresBuyerTagPhoto && !input.custodyRecord?.buyer_tag_photo_url) {
    missing.push("buyer tag photo");
  }

  if (rule.requiresBuyerPairPhoto && !input.custodyRecord?.buyer_pair_photo_url) {
    missing.push("buyer pair photo");
  }

  if (input.evidenceUrls.length < rule.minimumUploadedEvidenceCount) {
    missing.push(
      rule.minimumUploadedEvidenceCount === 1
        ? "at least 1 dispute evidence photo"
        : `at least ${rule.minimumUploadedEvidenceCount} dispute evidence photos`
    );
  }

  if (missing.length > 0) {
    throw new Error(`Missing required dispute evidence: ${missing.join(", ")}`);
  }
}

export async function createBuyerDispute(
  adminClient: SupabaseAdminClient,
  input: {
    orderId: string;
    buyerId: string;
    category: DisputeCategory;
    description: string;
    evidenceUrls: string[];
  }
) {
  const context = await loadBuyerOrderReviewContext(adminClient, input.orderId);

  if (context.buyer_id !== input.buyerId) {
    throw new Error("Only the buyer on this order can open a dispute");
  }

  if (!["delivered", "review_window"].includes(context.status)) {
    throw new Error(
      "Order must be delivered or in the review window before a dispute can be opened"
    );
  }

  const eligibility = evaluateBuyerCompletionEligibility(context);
  if (eligibility.hasActiveDispute) {
    throw new Error("An active dispute already exists for this order");
  }

  validateBuyerDisputeRequirements({
    category: input.category,
    description: input.description,
    evidenceUrls: input.evidenceUrls,
    custodyRecord: eligibility.custodyRecord,
  });

  const requiresCustodyReview =
    input.category === "authenticity" ||
    input.category === "tampered_tag" ||
    eligibility.chainStatus.status === "mismatch" ||
    eligibility.chainStatus.status === "admin_review";
  const nowIso = new Date().toISOString();

  const { data: dispute, error: disputeError } = await adminClient
    .from("order_disputes")
    .insert({
      order_id: input.orderId,
      buyer_id: context.buyer_id,
      seller_id: context.seller_id,
      opened_by_user_id: input.buyerId,
      category: input.category,
      status: "open",
      buyer_description: input.description,
      evidence_urls: input.evidenceUrls,
      buyer_evidence_urls: input.evidenceUrls,
      buyer_scanned_tag_value:
        eligibility.custodyRecord?.buyer_scanned_tag_value || null,
      seller_funds_frozen: true,
      metadata: {
        custodyVerificationStatus: eligibility.chainStatus.status,
        custodyAdminReviewRequired:
          eligibility.custodyRecord?.admin_review_required || false,
      },
    })
    .select()
    .single();

  if (disputeError || !dispute) {
    throw new Error(disputeError?.message || "Failed to create dispute");
  }

  await adminClient
    .from("orders")
    .update({
      status: "disputed",
      seller_funds_frozen: true,
      dispute_reason: input.category,
      dispute_text_buyer: input.description,
      dispute_evidence_buyer: input.evidenceUrls,
      updated_at: nowIso,
    })
    .eq("id", input.orderId);

  if (requiresCustodyReview) {
    await adminClient
      .from("order_chain_of_custody")
      .update({
        verification_status:
          eligibility.chainStatus.status === "mismatch"
            ? "mismatch"
            : "admin_review",
        admin_review_required: true,
        mismatch_reason:
          eligibility.chainStatus.status === "mismatch"
            ? eligibility.chainStatus.mismatchReason
            : "Buyer dispute requires chain-of-custody review",
        updated_at: nowIso,
      })
      .eq("order_id", input.orderId);
  }

  if (context.relay_tag_id && requiresCustodyReview) {
    await adminClient
      .from("relay_tags")
      .update({
        status: "disputed",
        disputed_at: nowIso,
      })
      .eq("id", context.relay_tag_id);
  }

  await logRelayAuditEvent(adminClient, {
    actorUserId: input.buyerId,
    actorRole: "buyer",
    orderId: input.orderId,
    sellerId: context.seller_id,
    eventType: "order.dispute_opened",
    metadata: {
      category: input.category,
      evidenceCount: input.evidenceUrls.length,
      requiresCustodyReview,
    },
  });

  return {
    dispute,
    eligibility,
  };
}
