import "server-only";

import crypto from "crypto";
import { determineCheckCheckRequirement } from "@/lib/seller-trust";
import { logRelayAuditEvent } from "@/lib/relay-audit";
import type { SellerTier } from "@/types";

type SupabaseAdminClient = ReturnType<typeof import("@/lib/supabase-admin").createAdminClient>;

const DEFAULT_TIER_3_RANDOM_AUDIT_RATE_BPS = 500;
const RECENT_AUTHENTICITY_DISPUTE_LOOKBACK_DAYS = 180;

export interface HighRiskSkuRecord {
  id: string;
  sku_normalized: string;
  display_sku: string | null;
  risk_reason: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface OrderAuthenticationDecision {
  sellerTier: SellerTier;
  relayTagRequired: boolean;
  checkcheckRequired: boolean;
  checkcheckReason: string | null;
  checkcheckStatus: "not_required" | "required";
  randomAuditRequired: boolean;
  randomAuditRateBpsSnapshot: number;
  highRiskSkuRequired: boolean;
  highRiskSkuId: string | null;
  highRiskSkuReason: string | null;
  hasRecentAuthenticityDispute: boolean;
  authRequirementsEvaluatedAt: string;
}

export interface FulfillmentGateStatus {
  sellerTier: SellerTier | null;
  relayTagRequired: boolean;
  checkcheckRequired: boolean;
  checkcheckReason: string | null;
  checkcheckStatus: string | null;
  checkcheckAdminNotes: string | null;
  relayTagStatus: string | null;
  chainOfCustodyStatus: string | null;
  chainOfCustodyAdminReviewRequired: boolean;
  randomAuditRequired: boolean;
  highRiskSkuRequired: boolean;
  legacyAuthFlow: boolean;
  labelReady: boolean;
  labelBlockedReasons: string[];
}

function normalizeSkuValue(value: string | null | undefined) {
  return (value || "").trim().toUpperCase();
}

function hashToBps(seed: string) {
  const digest = crypto.createHash("sha256").update(seed).digest("hex");
  const bucket = Number.parseInt(digest.slice(0, 8), 16);
  return bucket % 10000;
}

export function isLegacyOrderAuthFlow(order: {
  auth_requirements_evaluated_at?: string | null;
  relay_tag_id?: string | null;
  checkcheck_status?: string | null;
  order_chain_of_custody?: { order_id?: string | null } | null;
}) {
  return !order.auth_requirements_evaluated_at;
}

export async function getTier3RandomAuditRateBps(adminClient: SupabaseAdminClient) {
  const { data } = await adminClient
    .from("site_settings")
    .select("tier_3_random_audit_rate_bps")
    .limit(1)
    .maybeSingle();

  return data?.tier_3_random_audit_rate_bps ?? DEFAULT_TIER_3_RANDOM_AUDIT_RATE_BPS;
}

export async function getHighRiskSkuRecord(
  adminClient: SupabaseAdminClient,
  input: { sku?: string | null; skuNormalized?: string | null }
) {
  const normalizedSku = normalizeSkuValue(input.skuNormalized || input.sku);
  if (!normalizedSku) {
    return null;
  }

  const { data, error } = await adminClient
    .from("high_risk_skus")
    .select("*")
    .eq("sku_normalized", normalizedSku)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Failed to load high-risk SKU");
  }

  return (data || null) as HighRiskSkuRecord | null;
}

export async function hasRecentSellerAuthenticityDispute(
  adminClient: SupabaseAdminClient,
  sellerId: string
) {
  const cutoffIso = new Date(
    Date.now() - RECENT_AUTHENTICITY_DISPUTE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  const [disputesResult, violationsResult] = await Promise.all([
    adminClient
      .from("order_disputes")
      .select("id")
      .eq("seller_id", sellerId)
      .eq("category", "authenticity")
      .gte("created_at", cutoffIso)
      .limit(1),
    adminClient
      .from("seller_violations")
      .select("id")
      .eq("seller_id", sellerId)
      .eq("violation_type", "authenticity")
      .gte("created_at", cutoffIso)
      .limit(1),
  ]);

  return (disputesResult.data || []).length > 0 || (violationsResult.data || []).length > 0;
}

export async function evaluateOrderAuthenticationRequirements(
  adminClient: SupabaseAdminClient,
  input: {
    sellerId: string;
    sellerTier?: SellerTier | null;
    orderValueCents: number;
    sku?: string | null;
    skuNormalized?: string | null;
    randomSeed: string;
  }
): Promise<OrderAuthenticationDecision> {
  const resolvedSellerTier = input.sellerTier || "tier_1";
  const [highRiskSku, hasRecentAuthenticityDispute, auditRateBps] = await Promise.all([
    getHighRiskSkuRecord(adminClient, {
      sku: input.sku,
      skuNormalized: input.skuNormalized,
    }),
    hasRecentSellerAuthenticityDispute(adminClient, input.sellerId),
    getTier3RandomAuditRateBps(adminClient),
  ]);

  const randomAuditRequired =
    resolvedSellerTier === "tier_3" && hashToBps(input.randomSeed) < auditRateBps;

  const checkcheckDecision = determineCheckCheckRequirement({
    sellerTier: resolvedSellerTier,
    orderValueCents: input.orderValueCents,
    isHighRiskSku: Boolean(highRiskSku),
    hasRecentAuthenticityDispute,
    randomAuditRequired,
  });

  return {
    sellerTier: resolvedSellerTier,
    relayTagRequired: true,
    checkcheckRequired: checkcheckDecision.required,
    checkcheckReason: checkcheckDecision.reason,
    checkcheckStatus: checkcheckDecision.status === "not_required" ? "not_required" : "required",
    randomAuditRequired,
    randomAuditRateBpsSnapshot: auditRateBps,
    highRiskSkuRequired: Boolean(highRiskSku),
    highRiskSkuId: highRiskSku?.id || null,
    highRiskSkuReason: highRiskSku?.risk_reason || null,
    hasRecentAuthenticityDispute,
    authRequirementsEvaluatedAt: new Date().toISOString(),
  };
}

export async function reviewCheckCheckSubmission(
  adminClient: SupabaseAdminClient,
  input: {
    orderId: string;
    adminUserId: string;
    action: "approve" | "reject" | "request_resubmission" | "force_manual_review";
    reason?: string | null;
  }
) {
  const { data: order, error } = await adminClient
    .from("orders")
    .select("id, seller_id, checkcheck_required, checkcheck_status")
    .eq("id", input.orderId)
    .single();

  if (error || !order) {
    throw new Error(error?.message || "Order not found");
  }

  if (!order.checkcheck_required) {
    throw new Error("This order does not require CheckCheck");
  }

  const nowIso = new Date().toISOString();
  const nextStatus =
    input.action === "approve"
      ? "approved"
      : input.action === "force_manual_review"
        ? "admin_review"
        : "rejected";

  const { error: updateError } = await adminClient
    .from("orders")
    .update({
      checkcheck_status: nextStatus,
      checkcheck_reviewed_at: nowIso,
      checkcheck_reviewed_by_admin_id: input.adminUserId,
      checkcheck_admin_notes: input.reason || null,
    })
    .eq("id", input.orderId);

  if (updateError) {
    throw new Error(updateError.message || "Failed to review CheckCheck submission");
  }

  await logRelayAuditEvent(adminClient, {
    actorUserId: input.adminUserId,
    actorRole: "admin",
    orderId: input.orderId,
    sellerId: order.seller_id,
    eventType:
      input.action === "approve"
        ? "order.checkcheck_approved"
        : input.action === "force_manual_review"
          ? "order.checkcheck_manual_review_forced"
          : input.action === "request_resubmission"
            ? "order.checkcheck_resubmission_requested"
            : "order.checkcheck_rejected",
    metadata: {
      previousStatus: order.checkcheck_status,
      nextStatus,
      reason: input.reason || null,
    },
  });
}

export async function setOrderCustodyManualReview(
  adminClient: SupabaseAdminClient,
  input: {
    orderId: string;
    adminUserId: string;
    reason?: string | null;
  }
) {
  const { data: order, error } = await adminClient
    .from("orders")
    .select("id, seller_id, relay_tag_id")
    .eq("id", input.orderId)
    .single();

  if (error || !order) {
    throw new Error(error?.message || "Order not found");
  }

  const nowIso = new Date().toISOString();
  const { error: custodyError } = await adminClient
    .from("order_chain_of_custody")
    .update({
      verification_status: "admin_review",
      admin_review_required: true,
      mismatch_reason: input.reason || null,
      updated_at: nowIso,
    })
    .eq("order_id", input.orderId);

  if (custodyError) {
    throw new Error(custodyError.message || "Failed to force custody manual review");
  }

  if (order.relay_tag_id) {
    await adminClient
      .from("relay_tags")
      .update({
        photo_verification_status: "admin_review",
        admin_notes: input.reason || null,
      })
      .eq("id", order.relay_tag_id);
  }

  await logRelayAuditEvent(adminClient, {
    actorUserId: input.adminUserId,
    actorRole: "admin",
    orderId: input.orderId,
    sellerId: order.seller_id,
    eventType: "order.custody_manual_review_forced",
    metadata: {
      reason: input.reason || null,
    },
  });
}

export async function getOrderFulfillmentGateStatus(
  adminClient: SupabaseAdminClient,
  orderId: string
): Promise<FulfillmentGateStatus> {
  const { data: order, error } = await adminClient
    .from("orders")
    .select(`
      id,
      seller_id,
      relay_tag_required,
      relay_tag_id,
      checkcheck_required,
      checkcheck_reason,
      checkcheck_status,
      checkcheck_certificate_url,
      checkcheck_admin_notes,
      random_audit_required,
      high_risk_sku_required,
      auth_requirements_evaluated_at,
      seller:profiles!orders_seller_id_fkey(id, seller_tier),
      relay_tag:relay_tags!orders_relay_tag_id_fkey(id, status),
      order_chain_of_custody(*)
    `)
    .eq("id", orderId)
    .single();

  if (error || !order) {
    throw new Error(error?.message || "Order not found");
  }

  const legacyAuthFlow = isLegacyOrderAuthFlow(order as any);
  const custody = Array.isArray((order as any).order_chain_of_custody)
    ? (order as any).order_chain_of_custody[0]
    : (order as any).order_chain_of_custody;
  const relayTag = Array.isArray((order as any).relay_tag)
    ? (order as any).relay_tag[0]
    : (order as any).relay_tag;
  const reasons: string[] = [];

  if (!legacyAuthFlow && order.relay_tag_required) {
    if (!order.relay_tag_id) {
      reasons.push("Relay tag has not been bound to this order.");
    }

    if (!custody?.seller_tag_photo_url || !custody?.seller_pair_photo_url || !custody?.seller_box_photo_url || !custody?.seller_sealed_package_photo_url) {
      reasons.push("Relay custody uploads are incomplete.");
    }

    if (custody?.admin_review_required || custody?.verification_status === "admin_review") {
      reasons.push("Relay chain-of-custody evidence is waiting on admin review.");
    } else if (custody?.verification_status === "mismatch") {
      reasons.push("Relay chain-of-custody evidence was rejected and needs resubmission.");
    } else if (custody?.verification_status !== "verified") {
      reasons.push("Relay chain-of-custody evidence is not verified yet.");
    }
  }

  if (order.checkcheck_required) {
    if (!(order as any).checkcheck_certificate_url) {
      reasons.push("CheckCheck certificate has not been uploaded yet.");
    }

    if (legacyAuthFlow) {
      if (!["submitted", "approved"].includes(order.checkcheck_status || "")) {
        reasons.push("Legacy CheckCheck submission is still missing.");
      }
    } else if (order.checkcheck_status !== "approved") {
      reasons.push(
        order.checkcheck_status === "rejected"
          ? "CheckCheck was rejected and needs resubmission."
          : order.checkcheck_status === "admin_review"
            ? "CheckCheck is waiting on admin review."
            : "CheckCheck must be approved before label generation."
      );
    }
  }

  return {
    sellerTier: (order as any).seller?.seller_tier || null,
    relayTagRequired: Boolean(order.relay_tag_required),
    checkcheckRequired: Boolean(order.checkcheck_required),
    checkcheckReason: order.checkcheck_reason || null,
    checkcheckStatus: order.checkcheck_status || null,
    checkcheckAdminNotes: (order as any).checkcheck_admin_notes || null,
    relayTagStatus: relayTag?.status || null,
    chainOfCustodyStatus: custody?.verification_status || null,
    chainOfCustodyAdminReviewRequired: Boolean(custody?.admin_review_required),
    randomAuditRequired: Boolean(order.random_audit_required),
    highRiskSkuRequired: Boolean(order.high_risk_sku_required),
    legacyAuthFlow,
    labelReady: reasons.length === 0,
    labelBlockedReasons: reasons,
  };
}
