import "server-only";

import { getOrderFulfillmentGateStatus } from "@/lib/order-auth";
import { logRelayAuditEvent } from "@/lib/relay-audit";
import type { SellerTier } from "@/types";

type SupabaseAdminClient = ReturnType<typeof import("@/lib/supabase-admin").createAdminClient>;

export interface ParsedTagInputRow {
  serial: string;
  barcode: string | null;
}

export interface TagInventoryPolicy {
  sellerTier: SellerTier;
  requestMode: "welcome_pack" | "on_demand_request" | "bundle_250" | "monthly_replenishment";
  defaultRequestQuantity: number;
  description: string;
}

export interface LabelReadinessResult {
  ready: boolean;
  reasons: string[];
}

function normalizeTagValue(value: string | null | undefined) {
  return (value || "").trim().toUpperCase();
}

export function determineSellerTagInventoryPolicy(sellerTier: SellerTier): TagInventoryPolicy {
  if (sellerTier === "tier_3") {
    return {
      sellerTier,
      requestMode: "monthly_replenishment",
      defaultRequestQuantity: 250,
      description: "Tier 3 sellers receive Relay-managed monthly replenishment and can request intervention when inventory runs low.",
    };
  }

  if (sellerTier === "tier_2") {
    return {
      sellerTier,
      requestMode: "bundle_250",
      defaultRequestQuantity: 250,
      description: "Tier 2 sellers request tags in 250-tag bundles.",
    };
  }

  return {
    sellerTier,
    requestMode: "on_demand_request",
    defaultRequestQuantity: 50,
    description: "Tier 1 sellers receive a 50-tag welcome pack after approval and can request additional tags as needed.",
  };
}

export function parseTagImportText(input: string): ParsedTagInputRow[] {
  const rows = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const parsed = new Map<string, ParsedTagInputRow>();

  for (const row of rows) {
    const parts = row
      .split(/[,\t]/)
      .map((part) => part.trim())
      .filter(Boolean);

    if (parts.length === 0) {
      continue;
    }

    const serial = normalizeTagValue(parts[0]);
    const barcode = parts[1] ? normalizeTagValue(parts[1]) : null;

    if (!serial || serial === "SERIAL" || serial === "TAG_SERIAL_NUMBER") {
      continue;
    }

    parsed.set(serial, { serial, barcode });
  }

  return Array.from(parsed.values());
}

export async function recordRelayTagScanEvent(
  adminClient: SupabaseAdminClient,
  input: {
    relayTagId: string;
    orderId?: string | null;
    sellerId?: string | null;
    actorUserId?: string | null;
    actorRole: "system" | "admin" | "seller" | "buyer";
    scanType: string;
    scannedValue: string;
    scannedBarcodeValue?: string | null;
    metadata?: Record<string, unknown>;
  }
) {
  const { error } = await adminClient.from("relay_tag_scan_events").insert({
    relay_tag_id: input.relayTagId,
    order_id: input.orderId || null,
    seller_id: input.sellerId || null,
    actor_user_id: input.actorUserId || null,
    actor_role: input.actorRole,
    scan_type: input.scanType,
    scanned_value: input.scannedValue,
    scanned_barcode_value: input.scannedBarcodeValue || null,
    metadata: input.metadata || {},
  });

  if (error) {
    console.error("Failed to record relay tag scan event:", error);
  }
}

async function getOrderContext(adminClient: SupabaseAdminClient, orderId: string) {
  const { data: order, error } = await adminClient
    .from("orders")
    .select(`
      *,
      seller:profiles!orders_seller_id_fkey(id, seller_tier),
      order_chain_of_custody(*)
    `)
    .eq("id", orderId)
    .single();

  if (error || !order) {
    throw new Error(error?.message || "Order not found");
  }

  return order as any;
}

export async function bindRelayTagToOrder(
  adminClient: SupabaseAdminClient,
  input: {
    orderId: string;
    sellerId: string;
    actorUserId?: string | null;
    actorRole: "system" | "admin" | "seller";
    scannedValue: string;
    scannedBarcodeValue?: string | null;
    sellerTagPhotoUrl: string;
    sellerPairPhotoUrl: string;
    sellerBoxPhotoUrl: string;
    sellerSealedPackagePhotoUrl: string;
  }
) {
  const order = await getOrderContext(adminClient, input.orderId);

  if (order.seller_id !== input.sellerId) {
    throw new Error("Only the seller on this order can bind a Relay tag");
  }

  if (order.relay_tag_id && order.relay_tag_id !== null) {
    const existingCustody = order.order_chain_of_custody;
    const existingSubmittedValue = normalizeTagValue(existingCustody?.seller_scanned_tag_value);
    const normalizedRequestedValue = normalizeTagValue(input.scannedValue);

    if (
      order.relay_tag_id !== null &&
      existingCustody?.order_id &&
      existingSubmittedValue &&
      existingSubmittedValue !== normalizedRequestedValue
    ) {
      throw new Error("Relay tag binding is immutable after submission. Contact admin to review or reject the current custody submission.");
    }
  }

  const normalizedScan = normalizeTagValue(input.scannedValue);
  const normalizedBarcode = normalizeTagValue(input.scannedBarcodeValue);

  if (!normalizedScan) {
    throw new Error("A Relay tag serial or barcode is required");
  }

  const { data: tag, error: tagError } = await adminClient
    .from("relay_tags")
    .select("*")
    .or(`tag_serial_number.eq.${normalizedScan},barcode_value.eq.${normalizedScan}${normalizedBarcode ? `,barcode_value.eq.${normalizedBarcode}` : ""}`)
    .maybeSingle();

  if (tagError || !tag) {
    throw new Error("Relay tag not found");
  }

  if (tag.assigned_seller_id !== input.sellerId) {
    throw new Error("This Relay tag is not assigned to the seller on this order");
  }

  if (tag.status === "voided") {
    throw new Error("This Relay tag has been voided and cannot be used");
  }

  if (tag.assigned_order_id && tag.assigned_order_id !== input.orderId) {
    throw new Error("This Relay tag is already bound to another order");
  }

  if (tag.status !== "assigned_to_seller" && tag.status !== "bound_to_order" && tag.status !== "submitted_by_seller") {
    throw new Error("This Relay tag is not available for binding");
  }

  if (order.relay_tag_id && order.relay_tag_id !== tag.id) {
    throw new Error("This order already has a different Relay tag bound and it cannot be replaced automatically.");
  }

  const nowIso = new Date().toISOString();
  const expectedMatches =
    normalizeTagValue(tag.tag_serial_number) === normalizedScan ||
    normalizeTagValue(tag.barcode_value) === normalizedScan ||
    (normalizedBarcode && normalizeTagValue(tag.barcode_value) === normalizedBarcode);

  if (!expectedMatches) {
    await logRelayAuditEvent(adminClient, {
      actorUserId: input.actorUserId,
      actorRole: input.actorRole,
      eventType: "relay_tag.mismatch",
      sellerId: input.sellerId,
      orderId: input.orderId,
      metadata: {
        relayTagId: tag.id,
        scannedValue: normalizedScan,
        scannedBarcodeValue: normalizedBarcode || null,
      },
    });

    throw new Error("The scanned Relay tag does not match the stored tag record");
  }

  const { error: tagUpdateError } = await adminClient
    .from("relay_tags")
    .update({
      assigned_order_id: input.orderId,
      bound_to_order_at: tag.bound_to_order_at || nowIso,
      submitted_by_seller_at: nowIso,
      status: "submitted_by_seller",
      photo_verification_status: "admin_review",
    })
    .eq("id", tag.id);

  if (tagUpdateError) {
    throw new Error(tagUpdateError.message || "Failed to bind Relay tag");
  }

  await adminClient
    .from("orders")
    .update({
      relay_tag_id: tag.id,
      seller_funds_frozen: false,
    })
    .eq("id", input.orderId);

  const custodyPayload = {
    order_id: input.orderId,
    relay_tag_id: tag.id,
    seller_scanned_tag_value: normalizedScan,
    seller_tag_photo_url: input.sellerTagPhotoUrl,
    seller_pair_photo_url: input.sellerPairPhotoUrl,
    seller_box_photo_url: input.sellerBoxPhotoUrl,
    seller_sealed_package_photo_url: input.sellerSealedPackagePhotoUrl,
    verification_status: "admin_review",
    mismatch_reason: null,
    admin_review_required: true,
    seller_submitted_at: nowIso,
    updated_at: nowIso,
  };

  const existingCustody = order.order_chain_of_custody;
  if (existingCustody?.order_id) {
    const { error: custodyUpdateError } = await adminClient
      .from("order_chain_of_custody")
      .update(custodyPayload)
      .eq("order_id", input.orderId);

    if (custodyUpdateError) {
      throw new Error(custodyUpdateError.message || "Failed to update custody evidence");
    }
  } else {
    const { error: custodyInsertError } = await adminClient
      .from("order_chain_of_custody")
      .insert({
        ...custodyPayload,
        created_at: nowIso,
      });

    if (custodyInsertError) {
      throw new Error(custodyInsertError.message || "Failed to create custody evidence");
    }
  }

  await recordRelayTagScanEvent(adminClient, {
    relayTagId: tag.id,
    orderId: input.orderId,
    sellerId: input.sellerId,
    actorUserId: input.actorUserId,
    actorRole: input.actorRole,
    scanType: "seller_bind",
    scannedValue: normalizedScan,
    scannedBarcodeValue: normalizedBarcode || null,
    metadata: {
      manualReviewRequired: true,
    },
  });

  await logRelayAuditEvent(adminClient, {
    actorUserId: input.actorUserId,
    actorRole: input.actorRole,
    eventType: "relay_tag.bound",
    sellerId: input.sellerId,
    orderId: input.orderId,
    metadata: {
      relayTagId: tag.id,
      scannedValue: normalizedScan,
      manualReviewRequired: true,
    },
  });

  return { tagId: tag.id };
}

export async function recordCustodyUpload(
  adminClient: SupabaseAdminClient,
  input: {
    orderId: string;
    sellerId?: string | null;
    buyerId?: string | null;
    actorUserId?: string | null;
    actorRole: "seller" | "buyer" | "admin";
    uploadType:
      | "seller_tag_photo"
      | "seller_pair_photo"
      | "seller_box_photo"
      | "seller_sealed_package_photo"
      | "buyer_tag_photo"
      | "buyer_pair_photo";
    filePath: string;
  }
) {
  await logRelayAuditEvent(adminClient, {
    actorUserId: input.actorUserId,
    actorRole: input.actorRole,
    sellerId: input.sellerId || null,
    orderId: input.orderId,
    eventType: "relay_tag.upload",
    metadata: {
      uploadType: input.uploadType,
      filePath: input.filePath,
    },
  });
}

export async function approveOrderCustodyReview(
  adminClient: SupabaseAdminClient,
  input: {
    orderId: string;
    adminUserId: string;
    approve: boolean;
    reason?: string | null;
  }
) {
  const order = await getOrderContext(adminClient, input.orderId);
  const custody = order.order_chain_of_custody;

  if (!custody?.order_id || !order.relay_tag_id) {
    throw new Error("No Relay tag custody submission exists for this order");
  }

  const nowIso = new Date().toISOString();
  const nextStatus = input.approve ? "verified" : "mismatch";

  const { error: custodyUpdateError } = await adminClient
    .from("order_chain_of_custody")
    .update({
      verification_status: nextStatus,
      admin_review_required: false,
      mismatch_reason: input.approve ? null : input.reason || "Admin rejected tag evidence",
      verified_at: input.approve ? nowIso : null,
    })
    .eq("order_id", input.orderId);

  if (custodyUpdateError) {
    throw new Error(custodyUpdateError.message || "Failed to update custody review");
  }

  const { error: tagUpdateError } = await adminClient
    .from("relay_tags")
    .update({
      status: input.approve ? "bound_to_order" : "disputed",
      photo_verification_status: input.approve ? "verified" : "mismatch",
      admin_notes: input.reason || null,
      disputed_at: input.approve ? null : nowIso,
    })
    .eq("id", order.relay_tag_id);

  if (tagUpdateError) {
    throw new Error(tagUpdateError.message || "Failed to update Relay tag review");
  }

  await logRelayAuditEvent(adminClient, {
    actorUserId: input.adminUserId,
    actorRole: "admin",
    sellerId: order.seller_id,
    orderId: input.orderId,
    eventType: input.approve ? "relay_tag.admin_approved" : "relay_tag.mismatch",
    metadata: {
      relayTagId: order.relay_tag_id,
      reason: input.reason || null,
    },
  });
}

export async function recordBuyerRelayTagScan(
  adminClient: SupabaseAdminClient,
  input: {
    orderId: string;
    buyerId: string;
    scannedValue: string;
    buyerTagPhotoUrl?: string | null;
    buyerPairPhotoUrl?: string | null;
  }
) {
  const order = await getOrderContext(adminClient, input.orderId);
  if (order.buyer_id !== input.buyerId) {
    throw new Error("Only the buyer on this order can submit a buyer Relay tag scan");
  }

  if (!order.relay_tag_id) {
    throw new Error("This order does not have a Relay tag bound");
  }

  const normalizedScan = normalizeTagValue(input.scannedValue);
  if (!normalizedScan) {
    throw new Error("A Relay tag serial or barcode is required");
  }

  const nowIso = new Date().toISOString();
  const sellerSubmittedValue = normalizeTagValue(order.order_chain_of_custody?.seller_scanned_tag_value);
  const mismatch = sellerSubmittedValue && sellerSubmittedValue !== normalizedScan;

  const updatePayload: Record<string, unknown> = {
    buyer_scanned_tag_value: normalizedScan,
    buyer_tag_photo_url: input.buyerTagPhotoUrl || order.order_chain_of_custody?.buyer_tag_photo_url || null,
    buyer_pair_photo_url: input.buyerPairPhotoUrl || order.order_chain_of_custody?.buyer_pair_photo_url || null,
    buyer_submitted_at: nowIso,
    verification_status: mismatch ? "mismatch" : order.order_chain_of_custody?.verification_status || "submitted",
    mismatch_reason: mismatch
      ? "Buyer scanned tag does not match seller-submitted Relay tag"
      : order.order_chain_of_custody?.mismatch_reason || null,
    admin_review_required: mismatch || order.order_chain_of_custody?.admin_review_required || false,
  };

  await adminClient
    .from("order_chain_of_custody")
    .update(updatePayload)
    .eq("order_id", input.orderId);

  await adminClient
    .from("relay_tags")
    .update({
      buyer_scanned_at: nowIso,
      status: mismatch ? "disputed" : "buyer_scanned",
      photo_verification_status: mismatch ? "mismatch" : "verified",
      disputed_at: mismatch ? nowIso : null,
    })
    .eq("id", order.relay_tag_id);

  await recordRelayTagScanEvent(adminClient, {
    relayTagId: order.relay_tag_id,
    orderId: input.orderId,
    sellerId: order.seller_id,
    actorUserId: input.buyerId,
    actorRole: "buyer",
    scanType: "buyer_scan",
    scannedValue: normalizedScan,
    metadata: {
      mismatch,
    },
  });

  await logRelayAuditEvent(adminClient, {
    actorUserId: input.buyerId,
    actorRole: "buyer",
    sellerId: order.seller_id,
    orderId: input.orderId,
    eventType: mismatch ? "relay_tag.buyer_mismatch" : "relay_tag.buyer_scanned",
    metadata: {
      relayTagId: order.relay_tag_id,
      scannedValue: normalizedScan,
    },
  });
}

export async function assertOrderReadyForShippoLabel(
  adminClient: SupabaseAdminClient,
  orderId: string
): Promise<LabelReadinessResult> {
  const gateStatus = await getOrderFulfillmentGateStatus(adminClient, orderId);

  return {
    ready: gateStatus.labelReady,
    reasons: gateStatus.labelBlockedReasons,
  };
}
