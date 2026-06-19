import "server-only";

import crypto from "crypto";
import {
  applySellerDisputeLossPenalties,
  estimateRefundAmountCents,
  estimateSellerProceedsCents,
  finalizeBuyerRefundAndSellerLoss,
  freezeOrderPayoutsForDispute,
  processOrderPayoutTrigger,
  unfreezeOrderPayouts,
  consumeSellerReserveForOrder,
} from "@/lib/payouts";
import { getRelayBalanceSnapshot } from "@/lib/money-policy";
import { logRelayAuditEvent } from "@/lib/relay-audit";
import { banSellerIdentity } from "@/lib/seller-identity";
import { evaluateSellerTrustById, recordSellerViolation } from "@/lib/seller-trust-admin";
import { resolveSignedMediaList, resolveSignedMediaValue } from "@/lib/secure-storage";
import { toShippoAddress } from "@/lib/shipping-addresses";
import type { DisputeCategory, RelayAuditEvent, SellerTier } from "@/types";

type SupabaseAdminClient = ReturnType<typeof import("@/lib/supabase-admin").createAdminClient>;

const SHIPPO_API_KEY = process.env.SHIPPO_API_KEY!;

const RETURN_ADDRESS = {
  name: "Relay Returns",
  street1: "411 E Washington St",
  street2: "Unit 909D",
  city: "Ann Arbor",
  state: "MI",
  zip: "48104",
  country: "US",
};

const VALID_DISPUTE_CATEGORIES: DisputeCategory[] = [
  "authenticity",
  "condition_not_as_listed",
  "wrong_item",
  "tampered_tag",
  "missing_contents",
  "shipping_damage",
];

export type AdminDisputeAction =
  | "approve_buyer_claim"
  | "deny_buyer_claim"
  | "request_buyer_evidence"
  | "request_seller_evidence"
  | "mark_tag_tampered"
  | "mark_authenticity_violation"
  | "mark_condition_violation"
  | "mark_wrong_item"
  | "mark_shipping_carrier_issue"
  | "issue_refund_now"
  | "consume_seller_reserve"
  | "freeze_payout"
  | "unfreeze_payout"
  | "demote_seller"
  | "ban_seller"
  | "close_dispute"
  | "set_outcome";

export interface AdminDisputeListItem {
  orderId: string;
  disputeId: string;
  createdAt: string;
  status: string;
  resolutionStatus: "open" | "resolved";
  category: DisputeCategory | string;
  buyerName: string;
  sellerName: string;
  sellerTier: SellerTier;
  trustScore: number;
  orderValueCents: number;
  listingLabel: string;
  sku: string | null;
  size: string | null;
  deliveredAt: string | null;
  reviewDeadline: string | null;
  payoutStatus: string | null;
  reserveStatus: string;
  custodyStatus: string | null;
  tagStatus: string | null;
  checkcheckStatus: string | null;
  randomAuditRequired: boolean;
  highRiskSkuRequired: boolean;
}

interface AdminDisputeRecord {
  id: string;
  order_id: string;
  buyer_id: string | null;
  seller_id: string | null;
  opened_by_user_id: string | null;
  category: DisputeCategory;
  status: string;
  buyer_description: string | null;
  seller_description: string | null;
  evidence_urls: string[];
  buyer_evidence_urls: string[];
  seller_evidence_urls: string[];
  buyer_scanned_tag_value: string | null;
  seller_funds_frozen: boolean;
  admin_resolution: string | null;
  financial_outcome: string | null;
  seller_penalty_outcome: string | null;
  resolved_by_admin_id: string | null;
  resolved_at: string | null;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

function normalizeRelationRecord<T>(value: T | T[] | null | undefined) {
  if (Array.isArray(value)) {
    return (value[0] || null) as T | null;
  }

  return (value || null) as T | null;
}

function normalizeRelationList<T>(value: T | T[] | null | undefined) {
  if (Array.isArray(value)) {
    return value as T[];
  }

  return value ? [value as T] : [];
}

function normalizeTextArray(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function toCents(value: number | string | null | undefined) {
  return Math.max(0, Math.round(Number(value || 0) * 100));
}

function normalizeCategory(value: string | null | undefined): DisputeCategory {
  if (value && VALID_DISPUTE_CATEGORIES.includes(value as DisputeCategory)) {
    return value as DisputeCategory;
  }

  return "condition_not_as_listed";
}

function sellerDisplayName(profile: any) {
  return profile?.display_name || profile?.full_name || profile?.username || profile?.email || "Unknown";
}

function computeReserveSummary(entries: any[]) {
  const heldCents = entries.reduce((sum, row) => (row.status === "held" ? sum + Number(row.amount_cents || 0) : sum), 0);
  const releasedCents = entries.reduce((sum, row) => (row.status === "released" ? sum + Number(row.amount_cents || 0) : sum), 0);
  const consumedCents = entries.reduce((sum, row) => (row.status === "consumed" ? sum + Number(row.amount_cents || 0) : sum), 0);
  const frozenCents = entries.reduce((sum, row) => (row.is_frozen ? sum + Number(row.amount_cents || 0) : sum), 0);
  const nextReleaseAt =
    entries
      .filter((row) => row.status === "held" && row.release_eligible_at)
      .map((row) => row.release_eligible_at as string)
      .sort()[0] || null;

  let status = "none";
  if (frozenCents > 0) {
    status = "frozen";
  } else if (heldCents > 0) {
    status = "held";
  } else if (consumedCents > 0) {
    status = "consumed";
  } else if (releasedCents > 0) {
    status = "released";
  }

  return {
    status,
    heldCents,
    releasedCents,
    consumedCents,
    frozenCents,
    nextReleaseAt,
  };
}

function sumLedgerAmountByType(rows: any[], type: string) {
  return rows.reduce((sum, row) => {
    if (row.type !== type) {
      return sum;
    }

    return sum + Number(row.amount_cents || 0);
  }, 0);
}

function getLatestExposureHold(rows: any[]) {
  return [...rows].sort((left, right) => {
    return new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime();
  })[0] || null;
}

function isReviewWindowExpired(value: string | null | undefined) {
  if (!value) {
    return false;
  }

  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) && timestamp <= Date.now();
}

async function incrementSellerDisputeFlagCount(
  adminClient: SupabaseAdminClient,
  sellerId: string
) {
  const { data: sellerProfile } = await adminClient
    .from("profiles")
    .select("dispute_flags_count")
    .eq("id", sellerId)
    .single();

  await adminClient
    .from("profiles")
    .update({
      dispute_flags_count: (sellerProfile?.dispute_flags_count || 0) + 1,
    })
    .eq("id", sellerId);
}

function buildLegacyDisputeRecord(order: any): AdminDisputeRecord {
  return {
    id: `legacy-${order.id}`,
    order_id: order.id,
    buyer_id: order.buyer_id || null,
    seller_id: order.seller_id || null,
    opened_by_user_id: order.buyer_id || null,
    category: normalizeCategory(order.dispute_reason),
    status: order.dispute_ruling ? "resolved" : "open",
    buyer_description: order.dispute_text_buyer || null,
    seller_description: order.dispute_text_seller || null,
    evidence_urls: normalizeTextArray(order.dispute_evidence_buyer),
    buyer_evidence_urls: normalizeTextArray(order.dispute_evidence_buyer),
    seller_evidence_urls: normalizeTextArray(order.dispute_evidence_seller),
    buyer_scanned_tag_value: null,
    seller_funds_frozen: Boolean(order.seller_funds_frozen),
    admin_resolution: order.admin_notes || null,
    financial_outcome: order.dispute_ruling === "buyer" ? "return_required_refund_pending" : order.dispute_ruling === "seller" ? "seller_paid" : null,
    seller_penalty_outcome: order.dispute_ruling === "buyer" ? "legacy_buyer_dispute_win" : "none",
    resolved_by_admin_id: null,
    resolved_at: null,
    metadata: {
      legacyOrderDispute: true,
      legacyReason: order.dispute_reason || null,
    },
    created_at: order.updated_at || order.created_at,
    updated_at: order.updated_at || order.created_at,
  };
}

function normalizeDisputeRecord(order: any) {
  const firstClass = normalizeRelationRecord<AdminDisputeRecord>(order.order_disputes);
  if (firstClass) {
    return {
      ...firstClass,
      buyer_description: firstClass.buyer_description || order.dispute_text_buyer || null,
      seller_description: firstClass.seller_description || order.dispute_text_seller || null,
      buyer_evidence_urls:
        firstClass.buyer_evidence_urls?.length > 0
          ? firstClass.buyer_evidence_urls
          : normalizeTextArray(order.dispute_evidence_buyer),
      seller_evidence_urls:
        firstClass.seller_evidence_urls?.length > 0
          ? firstClass.seller_evidence_urls
          : normalizeTextArray(order.dispute_evidence_seller),
    };
  }

  return buildLegacyDisputeRecord(order);
}

async function createReturnLabel(buyerAddress: any, fallbackEmail?: string | null) {
  const shippoBuyerAddress = toShippoAddress({
    ...(buyerAddress || {}),
    email: buyerAddress?.email || fallbackEmail || undefined,
  });

  if (
    !shippoBuyerAddress?.street1 ||
    !shippoBuyerAddress.email ||
    !shippoBuyerAddress.phone ||
    !shippoBuyerAddress.city ||
    !shippoBuyerAddress.state ||
    !shippoBuyerAddress.zip
  ) {
    throw new Error("Buyer shipping address information is incomplete. Cannot create return label.");
  }

  const shipmentRes = await fetch("https://api.goshippo.com/shipments/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `ShippoToken ${SHIPPO_API_KEY}`,
    },
    body: JSON.stringify({
      address_from: {
        name: shippoBuyerAddress.name,
        email: shippoBuyerAddress.email,
        phone: shippoBuyerAddress.phone,
        street1: shippoBuyerAddress.street1,
        street2: shippoBuyerAddress.street2 || "",
        city: shippoBuyerAddress.city,
        state: shippoBuyerAddress.state,
        zip: shippoBuyerAddress.zip,
        country: shippoBuyerAddress.country || "US",
      },
      address_to: RETURN_ADDRESS,
      parcels: [
        {
          length: "10",
          width: "7",
          height: "4",
          distance_unit: "in",
          weight: "1",
          mass_unit: "lb",
        },
      ],
    }),
  });

  if (!shipmentRes.ok) {
    throw new Error("Failed to create return shipment");
  }

  const shipment = await shipmentRes.json();
  if (!shipment.rates || shipment.rates.length === 0) {
    throw new Error("No return shipping rates available");
  }

  const cheapestRate = shipment.rates.reduce(
    (min: any, rate: any) =>
      parseFloat(rate.amount) < parseFloat(min.amount) ? rate : min,
    shipment.rates[0]
  );

  const labelRes = await fetch("https://api.goshippo.com/transactions/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `ShippoToken ${SHIPPO_API_KEY}`,
    },
    body: JSON.stringify({
      rate: cheapestRate.object_id,
      label_download: { file_format: "PDF" },
      async: false,
    }),
  });

  if (!labelRes.ok) {
    throw new Error("Failed to purchase return label");
  }

  let label = await labelRes.json();
  if (label.status === "QUEUED" || label.status === "WAITING") {
    const txnId = label.object_id;
    for (let attempt = 0; attempt < 10; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const pollRes = await fetch(`https://api.goshippo.com/transactions/${txnId}`, {
        headers: { Authorization: `ShippoToken ${SHIPPO_API_KEY}` },
      });
      if (pollRes.ok) {
        label = await pollRes.json();
        if (label.status === "SUCCESS" || label.status === "ERROR") {
          break;
        }
      }
    }
  }

  if (label.status === "ERROR") {
    throw new Error(label.messages?.[0]?.text || "Return label generation failed");
  }

  return {
    trackingNumber:
      label.tracking_number || label.tracking_numbers?.[0] || `RET-${Date.now()}`,
    labelUrl:
      label.label_download?.href ||
      label.label_download?.pdf?.url ||
      label.label_url ||
      label.label_download?.url ||
      (typeof label.label_download === "string" ? label.label_download : null),
  };
}

function generatePackingSlipId() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const random = crypto.randomBytes(6);
  let id = "";
  for (let index = 0; index < 6; index += 1) {
    id += chars[random[index] % chars.length];
  }
  return `RET-${id}`;
}

async function getOrderForAdminDispute(adminClient: SupabaseAdminClient, orderId: string) {
  const { data, error } = await adminClient
    .from("orders")
    .select(`
      *,
      listing:listings(
        id,
        brand,
        model,
        nickname,
        sku,
        sku_normalized,
        images
      ),
      buyer:profiles!orders_buyer_id_fkey(
        id,
        email,
        display_name,
        full_name,
        username,
        role
      ),
      seller:profiles!orders_seller_id_fkey(
        id,
        email,
        display_name,
        full_name,
        username,
        role,
        seller_tier,
        trust_score,
        recommended_seller_tier,
        authenticity_violation_count,
        is_banned,
        ban_reason
      ),
      relay_tag:relay_tags!orders_relay_tag_id_fkey(*),
      order_chain_of_custody(*),
      order_disputes(*),
      order_payouts(*)
    `)
    .eq("id", orderId)
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Dispute order not found");
  }

  return data as any;
}

async function ensureFirstClassDisputeRecord(
  adminClient: SupabaseAdminClient,
  order: any
) {
  const existing = normalizeRelationRecord<AdminDisputeRecord>(order.order_disputes);
  if (existing) {
    return existing;
  }

  const payload = buildLegacyDisputeRecord(order);
  const { data, error } = await adminClient
    .from("order_disputes")
    .insert({
      order_id: payload.order_id,
      buyer_id: payload.buyer_id,
      seller_id: payload.seller_id,
      opened_by_user_id: payload.opened_by_user_id,
      category: payload.category,
      status: payload.status === "resolved" ? "resolved" : "open",
      buyer_description: payload.buyer_description,
      seller_description: payload.seller_description,
      evidence_urls: payload.evidence_urls,
      buyer_evidence_urls: payload.buyer_evidence_urls,
      seller_evidence_urls: payload.seller_evidence_urls,
      buyer_scanned_tag_value: payload.buyer_scanned_tag_value,
      seller_funds_frozen: payload.seller_funds_frozen,
      admin_resolution: payload.admin_resolution,
      financial_outcome: payload.financial_outcome,
      seller_penalty_outcome: payload.seller_penalty_outcome,
      metadata: payload.metadata,
      resolved_at: payload.status === "resolved" ? new Date().toISOString() : null,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Failed to create dispute record");
  }

  return data as AdminDisputeRecord;
}

function updateDisputeMetadata(
  dispute: AdminDisputeRecord,
  update: Record<string, unknown>
) {
  return {
    ...(dispute.metadata || {}),
    ...update,
  };
}

async function applyManualSellerDemotion(
  adminClient: SupabaseAdminClient,
  input: {
    sellerId: string;
    actorUserId: string;
    orderId: string;
    targetTier: SellerTier;
    reason: string;
  }
) {
  const { data: seller, error } = await adminClient
    .from("profiles")
    .select("seller_tier, recommended_seller_tier, trust_score")
    .eq("id", input.sellerId)
    .single();

  if (error || !seller) {
    throw new Error(error?.message || "Seller not found");
  }

  await adminClient
    .from("profiles")
    .update({
      seller_tier: input.targetTier,
      tier_manually_overridden: true,
      tier_manually_overridden_by: input.actorUserId,
      tier_override_reason: input.reason,
      tier_locked: true,
      tier_locked_at: new Date().toISOString(),
    })
    .eq("id", input.sellerId);

  await adminClient.from("seller_tier_history").insert({
    seller_id: input.sellerId,
    previous_tier: seller.seller_tier,
    new_tier: input.targetTier,
    recommended_tier: seller.recommended_seller_tier || input.targetTier,
    trust_score: seller.trust_score || 0,
    change_source: "manual_override",
    actor_user_id: input.actorUserId,
    reason: input.reason,
    metadata: {
      source: "admin_dispute_review",
      orderId: input.orderId,
    },
  });

  await recordSellerViolation(adminClient, {
    sellerId: input.sellerId,
    actorUserId: input.actorUserId,
    violationType: "manual_demotion",
    orderId: input.orderId,
    severity: "high",
    penaltyOutcome: "dispute_review_manual_demotion",
    notes: input.reason,
    metadata: {
      targetTier: input.targetTier,
    },
  });

  await evaluateSellerTrustById(adminClient, input.sellerId, {
    actorUserId: input.actorUserId,
    actorRole: "admin",
    source: "manual",
  });
}

async function applySellerBan(
  adminClient: SupabaseAdminClient,
  input: {
    sellerId: string;
    actorUserId: string;
    orderId: string;
    reason: string;
  }
) {
  const { data: seller, error } = await adminClient
    .from("profiles")
    .select("authenticity_violation_count, is_banned")
    .eq("id", input.sellerId)
    .single();

  if (error || !seller) {
    throw new Error(error?.message || "Seller not found");
  }

  if ((seller.authenticity_violation_count || 0) < 2) {
    throw new Error("Seller can only be banned here after a second authenticity violation");
  }

  await banSellerIdentity(input.sellerId, {
    adminClient,
    actorUserId: input.actorUserId,
    actorRole: "admin",
    reason: input.reason || "Second authenticity violation",
  });

  await logRelayAuditEvent(adminClient, {
    actorUserId: input.actorUserId,
    actorRole: "admin",
    sellerId: input.sellerId,
    orderId: input.orderId,
    eventType: "seller.banned",
    metadata: {
      reason: input.reason || "Second authenticity violation",
      source: "admin_dispute_review",
    },
  });
}

export async function listAdminDisputes(adminClient: SupabaseAdminClient) {
  const { data, error } = await adminClient
    .from("orders")
    .select(`
      id,
      buyer_id,
      seller_id,
      status,
      price,
      size,
      review_deadline,
      delivered_at,
      dispute_reason,
      dispute_ruling,
      seller_funds_frozen,
      payout_status,
      checkcheck_status,
      random_audit_required,
      high_risk_sku_required,
      relay_tag:relay_tags!orders_relay_tag_id_fkey(status),
      listing:listings(brand, model, sku, sku_normalized),
      buyer:profiles!orders_buyer_id_fkey(display_name, full_name, username, email),
      seller:profiles!orders_seller_id_fkey(display_name, full_name, username, email, seller_tier, trust_score),
      order_chain_of_custody(verification_status),
      order_disputes(id, category, status, created_at, financial_outcome, seller_penalty_outcome)
    `)
    .or("status.eq.disputed,dispute_ruling.not.is.null")
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(error.message || "Failed to load disputes");
  }

  const orderIds = (data || []).map((row) => row.id as string);
  const { data: reserveEntries, error: reserveError } = orderIds.length
    ? await adminClient
        .from("seller_reserve_entries")
        .select("order_id, amount_cents, status, is_frozen, release_eligible_at")
        .in("order_id", orderIds)
    : { data: [], error: null };

  if (reserveError) {
    throw new Error(reserveError.message || "Failed to load reserve summary");
  }

  const reserveByOrder = new Map<string, any[]>();
  for (const entry of reserveEntries || []) {
    const bucket = reserveByOrder.get(entry.order_id) || [];
    bucket.push(entry);
    reserveByOrder.set(entry.order_id, bucket);
  }

  const disputes: AdminDisputeListItem[] = (data || []).map((order: any) => {
    const dispute = normalizeDisputeRecord(order);
    const reserveSummary = computeReserveSummary(reserveByOrder.get(order.id) || []);
    const custody = normalizeRelationRecord<any>(order.order_chain_of_custody);
    const relayTag = normalizeRelationRecord<any>(order.relay_tag);
    const isResolved =
      dispute.status === "resolved" || dispute.status === "closed" || Boolean(order.dispute_ruling);

    return {
      orderId: order.id,
      disputeId: dispute.id,
      createdAt: dispute.created_at || order.updated_at || order.created_at,
      status: dispute.status,
      resolutionStatus: isResolved ? "resolved" : "open",
      category: dispute.category,
      buyerName: sellerDisplayName(order.buyer),
      sellerName: sellerDisplayName(order.seller),
      sellerTier: order.seller?.seller_tier || "tier_1",
      trustScore: order.seller?.trust_score || 0,
      orderValueCents: toCents(order.price),
      listingLabel: [order.listing?.brand, order.listing?.model].filter(Boolean).join(" ") || "Unknown listing",
      sku: order.listing?.sku || order.listing?.sku_normalized || null,
      size: order.size || null,
      deliveredAt: order.delivered_at || null,
      reviewDeadline: order.review_deadline || null,
      payoutStatus: order.payout_status || null,
      reserveStatus: reserveSummary.status,
      custodyStatus: custody?.verification_status || null,
      tagStatus: relayTag?.status || null,
      checkcheckStatus: order.checkcheck_status || null,
      randomAuditRequired: Boolean(order.random_audit_required),
      highRiskSkuRequired: Boolean(order.high_risk_sku_required),
    };
  });

  return {
    disputes,
    counts: {
      total: disputes.length,
      open: disputes.filter((dispute) => dispute.resolutionStatus === "open").length,
      resolved: disputes.filter((dispute) => dispute.resolutionStatus === "resolved").length,
      reviewRequired: disputes.filter(
        (dispute) =>
          dispute.custodyStatus === "admin_review" ||
          dispute.checkcheckStatus === "admin_review" ||
          dispute.payoutStatus === "frozen"
      ).length,
      frozenPayouts: disputes.filter((dispute) => dispute.payoutStatus === "frozen").length,
    },
  };
}

export async function getAdminDisputeDetail(adminClient: SupabaseAdminClient, orderId: string) {
  const order = await getOrderForAdminDispute(adminClient, orderId);
  const dispute = normalizeDisputeRecord(order);
  const seller = normalizeRelationRecord<any>(order.seller);
  const buyer = normalizeRelationRecord<any>(order.buyer);
  const relayTag = normalizeRelationRecord<any>(order.relay_tag);
  const custody = normalizeRelationRecord<any>(order.order_chain_of_custody);
  const orderPayouts = normalizeRelationList<any>(order.order_payouts);

  const [
    reserveEntriesResult,
    eventsResult,
    sellerViolationsResult,
    orderLedgerResult,
    exposureHoldsResult,
    relayBalance,
  ] = await Promise.all([
    adminClient
      .from("seller_reserve_entries")
      .select("*")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false }),
    adminClient
      .from("relay_audit_events")
      .select("*")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false })
      .limit(100),
    seller?.id
      ? adminClient
          .from("seller_violations")
          .select("*")
          .eq("seller_id", seller.id)
          .order("created_at", { ascending: false })
      .limit(10)
      : Promise.resolve({ data: [], error: null }),
    adminClient
      .from("relay_balance_ledger")
      .select("*")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false }),
    adminClient
      .from("exposure_holds")
      .select("*")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false }),
    seller?.id
      ? getRelayBalanceSnapshot(seller.id, { adminClient })
      : Promise.resolve(null),
  ]);

  if (reserveEntriesResult.error) {
    throw new Error(reserveEntriesResult.error.message || "Failed to load reserve entries");
  }
  if (eventsResult.error) {
    throw new Error(eventsResult.error.message || "Failed to load dispute timeline");
  }
  if (sellerViolationsResult.error) {
    throw new Error(sellerViolationsResult.error.message || "Failed to load seller violations");
  }
  if (orderLedgerResult.error) {
    throw new Error(orderLedgerResult.error.message || "Failed to load Relay Balance ledger");
  }
  if (exposureHoldsResult.error) {
    throw new Error(exposureHoldsResult.error.message || "Failed to load exposure holds");
  }

  const reserveEntries = reserveEntriesResult.data || [];
  const reserveSummary = computeReserveSummary(reserveEntries);
  const orderLedger = orderLedgerResult.data || [];
  const exposureHolds = exposureHoldsResult.data || [];
  const latestExposureHold = getLatestExposureHold(exposureHolds);
  const expectedTagValues = [relayTag?.tag_serial_number, relayTag?.barcode_value]
    .filter(Boolean)
    .map((value) => String(value).trim().toUpperCase());
  const sellerTagValue = (custody?.seller_scanned_tag_value || "").trim().toUpperCase();
  const buyerTagValue = (custody?.buyer_scanned_tag_value || "").trim().toUpperCase();
  const tagMatch = Boolean(
    buyerTagValue &&
      ((sellerTagValue && buyerTagValue === sellerTagValue) || expectedTagValues.includes(buyerTagValue))
  );
  const mismatchReason =
    custody?.mismatch_reason ||
    (buyerTagValue && !tagMatch ? "Buyer-scanned tag does not match the seller-bound Relay tag." : null);
  const signedCustody = custody
    ? {
        ...custody,
        seller_tag_photo_url: await resolveSignedMediaValue(adminClient, custody.seller_tag_photo_url),
        seller_pair_photo_url: await resolveSignedMediaValue(adminClient, custody.seller_pair_photo_url),
        seller_box_photo_url: await resolveSignedMediaValue(adminClient, custody.seller_box_photo_url),
        seller_sealed_package_photo_url: await resolveSignedMediaValue(adminClient, custody.seller_sealed_package_photo_url),
        buyer_tag_photo_url: await resolveSignedMediaValue(adminClient, custody.buyer_tag_photo_url),
        buyer_pair_photo_url: await resolveSignedMediaValue(adminClient, custody.buyer_pair_photo_url),
      }
    : null;
  const signedDispute = {
    ...dispute,
    evidence_urls: await resolveSignedMediaList(adminClient, dispute.evidence_urls),
    buyer_evidence_urls: await resolveSignedMediaList(adminClient, dispute.buyer_evidence_urls),
    seller_evidence_urls: await resolveSignedMediaList(adminClient, dispute.seller_evidence_urls),
  };
  const buyerPaidAmountCents = estimateRefundAmountCents({
    orderPrice: order.price,
    shippingCost: order.shipping_cost,
    stripeAmountTotal: order.amount_total,
  });
  const sellerProceedsCents = estimateSellerProceedsCents({
    sellerProceedsCents: order.seller_proceeds_cents,
    sellerEarnings: order.seller_earnings,
    orderPrice: order.price,
    stripeFeeEstimateCents: order.stripe_fee_estimate_cents,
  });
  const pendingCreditCents = sumLedgerAmountByType(orderLedger, "order_pending_credit");
  const availableCreditCents = sumLedgerAmountByType(orderLedger, "order_available_credit");
  const disputeFreezeCents = sumLedgerAmountByType(orderLedger, "dispute_freeze");
  const disputeDebitCents = Math.abs(sumLedgerAmountByType(orderLedger, "dispute_debit"));
  const exposureActiveCents = exposureHolds
    .filter((row: any) => ["active", "disputed"].includes(row.status))
    .reduce((sum: number, row: any) => sum + Number(row.amount_cents || 0), 0);
  const exposureReleasedCents = exposureHolds
    .filter((row: any) => row.status === "released")
    .reduce((sum: number, row: any) => sum + Number(row.amount_cents || 0), 0);
  const exposureConsumedCents = exposureHolds
    .filter((row: any) => row.status === "consumed")
    .reduce((sum: number, row: any) => sum + Number(row.amount_cents || 0), 0);

  return {
    order: {
      ...order,
      auth_photos: await resolveSignedMediaList(adminClient, order.auth_photos),
      checkcheck_certificate_url: await resolveSignedMediaValue(adminClient, order.checkcheck_certificate_url),
      dispute_evidence_buyer: await resolveSignedMediaList(adminClient, order.dispute_evidence_buyer),
      dispute_evidence_seller: await resolveSignedMediaList(adminClient, order.dispute_evidence_seller),
      buyer,
      seller,
      relay_tag: relayTag,
      order_chain_of_custody: signedCustody,
      order_dispute: signedDispute,
      order_payouts: orderPayouts,
    },
    relayBalance,
    orderLedger,
    exposureHolds,
    reserveEntries,
    reserveSummary,
    sellerViolations: sellerViolationsResult.data || [],
    timeline: (eventsResult.data || []) as RelayAuditEvent[],
    computed: {
      orderValueCents: toCents(order.price),
      buyerPaidAmountCents,
      refundAmountCents: buyerPaidAmountCents,
      sellerProceedsCents,
      pendingCreditCents,
      availableCreditCents,
      disputeFreezeCents,
      disputeDebitCents,
      exposureActiveCents,
      exposureReleasedCents,
      exposureConsumedCents,
      exposureStatus: latestExposureHold?.status || "none",
      currentExposureHoldCents: Number(latestExposureHold?.amount_cents || 0),
      relayBalanceImpact: {
        totalBalanceCents: relayBalance?.totalBalanceCents || 0,
        pendingBalanceCents: relayBalance?.pendingBalanceCents || 0,
        availableBalanceCents: relayBalance?.availableBalanceCents || 0,
        exposureCents: relayBalance?.exposureCents || 0,
        withdrawableBalanceCents: relayBalance?.withdrawableBalanceCents || 0,
        adminFrozen: relayBalance?.adminFrozen || false,
      },
      sellerDebitAmountCents:
        disputeDebitCents > 0 ? disputeDebitCents : sellerProceedsCents,
      finalFinancialOutcome: dispute.financial_outcome || "pending_admin_resolution",
      withdrawalBlocked:
        Boolean(order.seller_funds_frozen) ||
        order.payout_status === "frozen" ||
        Boolean(relayBalance?.adminFrozen),
      reserveStatus: reserveSummary.status,
      tagMatch,
      tagMismatchReason: mismatchReason,
      legacyDisputeFlow: Boolean(dispute.metadata?.legacyOrderDispute),
      reviewFlags: {
        custody: Boolean(custody?.admin_review_required) || custody?.verification_status === "admin_review",
        checkcheck: order.checkcheck_status === "admin_review",
        payout: order.payout_status === "frozen",
      },
    },
  };
}

export async function runAdminDisputeAction(
  adminClient: SupabaseAdminClient,
  input: {
    orderId: string;
    action: AdminDisputeAction;
    adminUserId: string;
    notes?: string | null;
    targetTier?: SellerTier | null;
    consumeAmountCents?: number | null;
    outcome?: string | null;
  }
) {
  const order = await getOrderForAdminDispute(adminClient, input.orderId);
  const dispute = await ensureFirstClassDisputeRecord(adminClient, order);
  const seller = normalizeRelationRecord<any>(order.seller);
  const nowIso = new Date().toISOString();
  const notes = input.notes?.trim() || null;

  const updateOrderAdminNotes = async () => {
    if (!notes) {
      return;
    }

    await adminClient
      .from("orders")
      .update({
        admin_notes: notes,
      })
      .eq("id", input.orderId);
  };

  if (input.action === "approve_buyer_claim" || input.action === "issue_refund_now") {
    const refundAmountCents = estimateRefundAmountCents({
      orderPrice: order.price,
      shippingCost: order.shipping_cost,
      stripeAmountTotal: order.amount_total,
    });
    const result = await finalizeBuyerRefundAndSellerLoss(adminClient, {
      orderId: input.orderId,
      actorUserId: input.adminUserId,
      actorRole: "admin",
    });

    await adminClient
      .from("orders")
      .update({
        status: "refunded",
        dispute_ruling: "buyer",
        admin_notes: notes,
        seller_funds_frozen: true,
        updated_at: nowIso,
      })
      .eq("id", input.orderId);

    await adminClient
      .from("order_disputes")
      .update({
        status: "resolved",
        admin_resolution:
          notes || "Buyer won dispute. Buyer refunded and seller Relay Balance adjusted.",
        financial_outcome: "buyer_refunded",
        seller_penalty_outcome: dispute.category,
        seller_funds_frozen: true,
        resolved_by_admin_id: input.adminUserId,
        resolved_at: nowIso,
        metadata: updateDisputeMetadata(dispute, {
          outcome: "buyer_wins",
          refundAmountCents,
          debitedAmountCents: result.debitedAmountCents,
          resolutionFlow: "relay_balance_refund",
        }),
      })
      .eq("id", dispute.id);

    await applySellerDisputeLossPenalties(adminClient, {
      orderId: input.orderId,
      sellerId: order.seller_id,
      category: dispute.category,
      actorUserId: input.adminUserId,
      notes,
    });

    await incrementSellerDisputeFlagCount(adminClient, order.seller_id);

    await logRelayAuditEvent(adminClient, {
      actorUserId: input.adminUserId,
      actorRole: "admin",
      orderId: input.orderId,
      sellerId: order.seller_id,
      eventType: "admin.dispute_buyer_won",
      metadata: {
        category: dispute.category,
        refundAmountCents,
        sellerDebitAmountCents: result.debitedAmountCents,
        notes,
      },
    });
  } else if (input.action === "deny_buyer_claim") {
    const reviewWindowExpired = isReviewWindowExpired(
      order.review_window_ends_at || order.review_deadline
    );

    await adminClient
      .from("orders")
      .update({
        status: "completed",
        dispute_ruling: "seller",
        admin_notes: notes,
        seller_funds_frozen: false,
        updated_at: nowIso,
      })
      .eq("id", input.orderId);

    await unfreezeOrderPayouts(adminClient, {
      orderId: input.orderId,
      sellerId: order.seller_id,
      actorUserId: input.adminUserId,
      actorRole: "admin",
      reason: notes || "Seller won dispute",
    });

    await processOrderPayoutTrigger(adminClient, {
      orderId: input.orderId,
      trigger: "manual_override",
      actorUserId: input.adminUserId,
      actorRole: "admin",
      overrideReason: notes,
    });

    await adminClient
      .from("order_disputes")
      .update({
        status: "resolved",
        admin_resolution: notes || "Seller won dispute.",
        financial_outcome: "seller_paid",
        seller_penalty_outcome: "none",
        seller_funds_frozen: false,
        resolved_by_admin_id: input.adminUserId,
        resolved_at: nowIso,
        metadata: updateDisputeMetadata(dispute, {
          outcome: "seller_wins",
          reviewWindowExpired,
          exposureReleased: false,
          exposureInactiveAtLaunch: true,
        }),
      })
      .eq("id", dispute.id);

    await logRelayAuditEvent(adminClient, {
      actorUserId: input.adminUserId,
      actorRole: "admin",
      orderId: input.orderId,
      sellerId: order.seller_id,
      eventType: "admin.dispute_seller_won",
      metadata: {
        reviewWindowExpired,
        exposureReleased: false,
        exposureInactiveAtLaunch: true,
        notes,
      },
    });
  } else if (input.action === "request_buyer_evidence" || input.action === "request_seller_evidence") {
    const requestedFrom = input.action === "request_buyer_evidence" ? "buyer" : "seller";
    const priorRequests = Array.isArray(dispute.metadata?.evidenceRequests)
      ? dispute.metadata.evidenceRequests
      : [];

    await adminClient
      .from("order_disputes")
      .update({
        status: "under_review",
        admin_resolution: notes || dispute.admin_resolution,
        metadata: updateDisputeMetadata(dispute, {
          evidenceRequests: [
            ...priorRequests,
            {
              requestedFrom,
              requestedAt: nowIso,
              requestedBy: input.adminUserId,
              notes,
            },
          ],
          lastRequestedEvidenceFrom: requestedFrom,
        }),
      })
      .eq("id", dispute.id);

    await updateOrderAdminNotes();
  } else if (input.action === "freeze_payout") {
    await freezeOrderPayoutsForDispute(adminClient, {
      orderId: input.orderId,
      sellerId: order.seller_id,
      actorUserId: input.adminUserId,
      actorRole: "admin",
      reason: notes || "Admin froze payout during dispute review",
    });

    await adminClient
      .from("orders")
      .update({
        seller_funds_frozen: true,
      })
      .eq("id", input.orderId);

    await adminClient
      .from("order_disputes")
      .update({
        seller_funds_frozen: true,
        status: dispute.status === "resolved" ? dispute.status : "under_review",
        metadata: updateDisputeMetadata(dispute, {
          manualPayoutFreezeAt: nowIso,
        }),
      })
      .eq("id", dispute.id);

    await updateOrderAdminNotes();
  } else if (input.action === "unfreeze_payout") {
    await unfreezeOrderPayouts(adminClient, {
      orderId: input.orderId,
      sellerId: order.seller_id,
      actorUserId: input.adminUserId,
      actorRole: "admin",
      reason: notes || "Admin unfroze payout during dispute review",
    });

    await adminClient
      .from("orders")
      .update({
        seller_funds_frozen: false,
      })
      .eq("id", input.orderId);

    await adminClient
      .from("order_disputes")
      .update({
        seller_funds_frozen: false,
        metadata: updateDisputeMetadata(dispute, {
          manualPayoutUnfreezeAt: nowIso,
        }),
      })
      .eq("id", dispute.id);

    await updateOrderAdminNotes();
  } else if (input.action === "consume_seller_reserve") {
    const targetConsumeCents = Math.max(0, Number(input.consumeAmountCents || 0));
    if (targetConsumeCents <= 0) {
      throw new Error("A positive reserve consumption amount is required");
    }

    const consumedCents = await consumeSellerReserveForOrder(adminClient, {
      sellerId: order.seller_id,
      orderId: input.orderId,
      targetConsumeCents,
      actorUserId: input.adminUserId,
      actorRole: "admin",
    });

    await adminClient
      .from("order_disputes")
      .update({
        metadata: updateDisputeMetadata(dispute, {
          manualReserveConsumptionCents: consumedCents,
          manualReserveConsumedAt: nowIso,
        }),
      })
      .eq("id", dispute.id);

    await updateOrderAdminNotes();
  } else if (
    input.action === "mark_tag_tampered" ||
    input.action === "mark_authenticity_violation" ||
    input.action === "mark_condition_violation" ||
    input.action === "mark_wrong_item" ||
    input.action === "mark_shipping_carrier_issue"
  ) {
    const nextCategory =
      input.action === "mark_tag_tampered"
        ? "tampered_tag"
        : input.action === "mark_authenticity_violation"
          ? "authenticity"
          : input.action === "mark_condition_violation"
            ? "condition_not_as_listed"
            : input.action === "mark_wrong_item"
              ? "wrong_item"
              : "shipping_damage";

    await adminClient
      .from("order_disputes")
      .update({
        category: nextCategory,
        status: dispute.status === "resolved" ? dispute.status : "under_review",
        admin_resolution: notes || dispute.admin_resolution,
        seller_penalty_outcome: nextCategory,
        metadata: updateDisputeMetadata(dispute, {
          adminMarkedCategory: nextCategory,
          adminMarkedCategoryAt: nowIso,
        }),
      })
      .eq("id", dispute.id);

    if (nextCategory === "tampered_tag" && order.relay_tag_id) {
      await Promise.all([
        adminClient
          .from("relay_tags")
          .update({
            status: "disputed",
            photo_verification_status: "mismatch",
            admin_notes: notes || "Admin marked relay tag as tampered.",
            disputed_at: nowIso,
          })
          .eq("id", order.relay_tag_id),
        adminClient
          .from("order_chain_of_custody")
          .update({
            verification_status: "mismatch",
            admin_review_required: true,
            mismatch_reason: notes || "Admin marked relay tag as tampered.",
            updated_at: nowIso,
          })
          .eq("order_id", input.orderId),
      ]);

      await recordSellerViolation(adminClient, {
        sellerId: order.seller_id,
        actorUserId: input.adminUserId,
        violationType: "tag_tampering",
        orderId: input.orderId,
        severity: "critical",
        penaltyOutcome: "admin_dispute_review",
        notes: notes || "Admin marked the dispute as tag tampering.",
      });
      await evaluateSellerTrustById(adminClient, order.seller_id, {
        actorUserId: input.adminUserId,
        actorRole: "admin",
        source: "manual",
      });
    }

    if (nextCategory === "authenticity") {
      await recordSellerViolation(adminClient, {
        sellerId: order.seller_id,
        actorUserId: input.adminUserId,
        violationType: "authenticity",
        orderId: input.orderId,
        severity: "critical",
        penaltyOutcome: "admin_dispute_review",
        notes: notes || "Admin marked the dispute as an authenticity violation.",
      });
      await evaluateSellerTrustById(adminClient, order.seller_id, {
        actorUserId: input.adminUserId,
        actorRole: "admin",
        source: "manual",
      });
    }

    await updateOrderAdminNotes();
  } else if (input.action === "demote_seller") {
    const currentTier = seller?.seller_tier || "tier_1";
    const targetTier =
      input.targetTier ||
      (currentTier === "tier_3" ? "tier_2" : "tier_1");

    await applyManualSellerDemotion(adminClient, {
      sellerId: order.seller_id,
      actorUserId: input.adminUserId,
      orderId: input.orderId,
      targetTier,
      reason: notes || `Admin dispute review demoted seller to ${targetTier}.`,
    });

    await adminClient
      .from("order_disputes")
      .update({
        seller_penalty_outcome: `manual_demotion_${targetTier}`,
        metadata: updateDisputeMetadata(dispute, {
          demotedSellerToTier: targetTier,
          sellerDemotedAt: nowIso,
        }),
      })
      .eq("id", dispute.id);
  } else if (input.action === "ban_seller") {
    await applySellerBan(adminClient, {
      sellerId: order.seller_id,
      actorUserId: input.adminUserId,
      orderId: input.orderId,
      reason: notes || "Second authenticity violation",
    });

    await adminClient
      .from("order_disputes")
      .update({
        seller_penalty_outcome: "seller_banned",
        metadata: updateDisputeMetadata(dispute, {
          sellerBannedAt: nowIso,
        }),
      })
      .eq("id", dispute.id);
  } else if (input.action === "close_dispute") {
    await adminClient
      .from("order_disputes")
      .update({
        status: "closed",
        admin_resolution: notes || dispute.admin_resolution || "Dispute closed by admin.",
        resolved_by_admin_id: input.adminUserId,
        resolved_at: nowIso,
      })
      .eq("id", dispute.id);

    await updateOrderAdminNotes();
  } else if (input.action === "set_outcome") {
    const outcome = input.outcome || "manual_handling";
    if ([
      "carrier_issue_manual_handling",
      "insufficient_evidence",
      "partial_resolution_manual_review",
    ].includes(outcome)) {
      await freezeOrderPayoutsForDispute(adminClient, {
        orderId: input.orderId,
        sellerId: order.seller_id,
        actorUserId: input.adminUserId,
        actorRole: "admin",
        reason: notes || "Admin routed dispute to manual handling.",
      });

      await adminClient
        .from("orders")
        .update({
          seller_funds_frozen: true,
          status: "disputed",
          admin_notes: notes,
        })
        .eq("id", input.orderId);
    }

    await adminClient
      .from("order_disputes")
      .update({
        status: ["carrier_issue_manual_handling", "insufficient_evidence", "partial_resolution_manual_review"].includes(outcome)
          ? "under_review"
          : dispute.status,
        admin_resolution: notes || dispute.admin_resolution,
        financial_outcome: outcome,
        seller_funds_frozen: true,
        metadata: updateDisputeMetadata(dispute, {
          adminOutcome: outcome,
          adminOutcomeSetAt: nowIso,
        }),
      })
      .eq("id", dispute.id);

    await updateOrderAdminNotes();

    await logRelayAuditEvent(adminClient, {
      actorUserId: input.adminUserId,
      actorRole: "admin",
      orderId: input.orderId,
      sellerId: order.seller_id,
      eventType: "admin.dispute_manual_handling",
      metadata: {
        outcome,
        notes,
      },
    });
  } else {
    throw new Error("Unsupported dispute action");
  }

  await logRelayAuditEvent(adminClient, {
    actorUserId: input.adminUserId,
    actorRole: "admin",
    orderId: input.orderId,
    sellerId: order.seller_id,
    eventType: "admin.dispute_action",
    metadata: {
      action: input.action,
      notes,
      targetTier: input.targetTier || null,
      consumeAmountCents: input.consumeAmountCents || null,
      outcome: input.outcome || null,
    },
  });

  return getAdminDisputeDetail(adminClient, input.orderId);
}
