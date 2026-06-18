import "server-only";

import Stripe from "stripe";
import { logRelayAuditEvent } from "@/lib/relay-audit";
import { createAdminClient } from "@/lib/supabase-admin";
import type {
  AuditActorRole,
  PaymentFundingSource,
  StripeSettlementStatus,
} from "@/types/trust";

type SupabaseAdminClient = ReturnType<typeof createAdminClient>;

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-06-20",
});

interface SettlementOrderRow {
  id: string;
  seller_id: string;
  stripe_payment_intent_id: string | null;
  payment_funding_source: PaymentFundingSource | null;
  stripe_charge_id: string | null;
  stripe_balance_transaction_id: string | null;
  stripe_funds_available_on: string | null;
  stripe_funds_settled_at: string | null;
  stripe_settlement_status: StripeSettlementStatus | null;
}

interface StripeCardSettlementLookupResult {
  paymentSourceType: PaymentFundingSource;
  chargeId: string | null;
  balanceTransactionId: string | null;
  availableOn: string | null;
  settledAt: string | null;
  status: StripeSettlementStatus;
  retrievedFromStripe: boolean;
  lookupError: string | null;
}

export interface OrderSettlementSyncResult extends StripeCardSettlementLookupResult {
  orderId: string;
  sellerId: string;
  paymentIntentId: string | null;
  changed: boolean;
}

function coerceDate(value?: string | null) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isChargeObject(charge: Stripe.PaymentIntent["latest_charge"] | null) {
  return Boolean(charge && typeof charge === "object" && "id" in charge);
}

function isBalanceTransactionObject(
  balanceTransaction: Stripe.Charge["balance_transaction"] | null
) {
  return Boolean(
    balanceTransaction &&
      typeof balanceTransaction === "object" &&
      "id" in balanceTransaction
  );
}

function resolveSettlementStatus(input: {
  paymentSourceType: PaymentFundingSource;
  availableOn: string | null;
  settledAt: string | null;
  lookupAttempted: boolean;
  fallbackStatus?: StripeSettlementStatus | null;
}) {
  if (input.paymentSourceType === "relay_balance") {
    return "not_applicable";
  }

  if (input.settledAt) {
    return "settled";
  }

  if (input.availableOn) {
    return "pending";
  }

  if (input.lookupAttempted) {
    return "pending_settlement_unknown";
  }

  return input.fallbackStatus || "pending";
}

async function loadOrderForSettlementById(
  adminClient: SupabaseAdminClient,
  orderId: string
) {
  const { data, error } = await adminClient
    .from("orders")
    .select(`
      id,
      seller_id,
      stripe_payment_intent_id,
      payment_funding_source,
      stripe_charge_id,
      stripe_balance_transaction_id,
      stripe_funds_available_on,
      stripe_funds_settled_at,
      stripe_settlement_status
    `)
    .eq("id", orderId)
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Order not found for settlement sync");
  }

  return data as SettlementOrderRow;
}

async function loadOrderForSettlementByPaymentIntentId(
  adminClient: SupabaseAdminClient,
  paymentIntentId: string
) {
  const { data, error } = await adminClient
    .from("orders")
    .select(`
      id,
      seller_id,
      stripe_payment_intent_id,
      payment_funding_source,
      stripe_charge_id,
      stripe_balance_transaction_id,
      stripe_funds_available_on,
      stripe_funds_settled_at,
      stripe_settlement_status
    `)
    .eq("stripe_payment_intent_id", paymentIntentId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Failed to load order by payment intent");
  }

  return (data as SettlementOrderRow | null) || null;
}

async function fetchExpandedCharge(
  paymentIntent: Stripe.Response<Stripe.PaymentIntent>
) {
  if (isChargeObject(paymentIntent.latest_charge || null)) {
    return paymentIntent.latest_charge as Stripe.Charge;
  }

  if (typeof paymentIntent.latest_charge === "string") {
    return stripe.charges.retrieve(paymentIntent.latest_charge, {
      expand: ["balance_transaction"],
    });
  }

  return null;
}

async function fetchExpandedBalanceTransaction(charge: Stripe.Charge | null) {
  if (!charge?.balance_transaction) {
    return null;
  }

  if (isBalanceTransactionObject(charge.balance_transaction)) {
    return charge.balance_transaction as Stripe.BalanceTransaction;
  }

  if (typeof charge.balance_transaction === "string") {
    return stripe.balanceTransactions.retrieve(charge.balance_transaction);
  }

  return null;
}

async function fetchStripeCardSettlementLookup(
  paymentIntentId: string,
  context: {
    orderId?: string;
    source: string;
  }
): Promise<StripeCardSettlementLookupResult> {
  const now = new Date();

  try {
    console.info("Fetching Stripe settlement metadata", {
      orderId: context.orderId || null,
      paymentIntentId,
      source: context.source,
    });

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, {
      expand: ["latest_charge.balance_transaction"],
    });
    const charge = await fetchExpandedCharge(paymentIntent);
    const balanceTransaction = await fetchExpandedBalanceTransaction(charge);
    const availableOnUnix =
      typeof balanceTransaction?.available_on === "number"
        ? balanceTransaction.available_on
        : null;
    const availableOn =
      availableOnUnix === null
        ? null
        : new Date(availableOnUnix * 1000).toISOString();
    const settledAt =
      availableOn && new Date(availableOn).getTime() <= now.getTime()
        ? availableOn
        : null;
    const status = resolveSettlementStatus({
      paymentSourceType: "card",
      availableOn,
      settledAt,
      lookupAttempted: true,
    });

    console.info("Fetched Stripe settlement metadata", {
      orderId: context.orderId || null,
      paymentIntentId,
      chargeId: charge?.id || null,
      balanceTransactionId: balanceTransaction?.id || null,
      availableOn,
      status,
      source: context.source,
    });

    return {
      paymentSourceType: "card",
      chargeId: charge?.id || null,
      balanceTransactionId: balanceTransaction?.id || null,
      availableOn,
      settledAt,
      status,
      retrievedFromStripe: true,
      lookupError: null,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown Stripe settlement error";

    console.error("Failed to retrieve Stripe settlement metadata", {
      orderId: context.orderId || null,
      paymentIntentId,
      source: context.source,
      error: message,
    });

    return {
      paymentSourceType: "card",
      chargeId: null,
      balanceTransactionId: null,
      availableOn: null,
      settledAt: null,
      status: "pending_settlement_unknown",
      retrievedFromStripe: false,
      lookupError: message,
    };
  }
}

async function persistSettlementSnapshot(
  adminClient: SupabaseAdminClient,
  order: SettlementOrderRow,
  snapshot: StripeCardSettlementLookupResult
) {
  const now = new Date();
  const existingAvailableOn = order.stripe_funds_available_on || null;
  const existingSettledAt = order.stripe_funds_settled_at || null;
  const availableOn = snapshot.availableOn || existingAvailableOn;
  const settledAt =
    snapshot.settledAt ||
    existingSettledAt ||
    (availableOn && new Date(availableOn).getTime() <= now.getTime()
      ? availableOn
      : null);
  const status = resolveSettlementStatus({
    paymentSourceType: snapshot.paymentSourceType,
    availableOn,
    settledAt,
    lookupAttempted: snapshot.retrievedFromStripe || Boolean(snapshot.lookupError),
    fallbackStatus: order.stripe_settlement_status,
  });

  const orderUpdatePayload = {
    payment_funding_source: snapshot.paymentSourceType,
    stripe_charge_id: snapshot.chargeId || order.stripe_charge_id || null,
    stripe_balance_transaction_id:
      snapshot.balanceTransactionId || order.stripe_balance_transaction_id || null,
    stripe_funds_available_on: availableOn,
    stripe_funds_settled_at: settledAt,
    stripe_settlement_status: status,
  };

  const payoutUpdatePayload = {
    payment_source_type: snapshot.paymentSourceType,
    stripe_charge_id: orderUpdatePayload.stripe_charge_id,
    stripe_balance_transaction_id: orderUpdatePayload.stripe_balance_transaction_id,
    stripe_funds_available_on: orderUpdatePayload.stripe_funds_available_on,
    stripe_funds_settled_at: orderUpdatePayload.stripe_funds_settled_at,
    stripe_settlement_status: orderUpdatePayload.stripe_settlement_status,
  };

  const changed =
    order.payment_funding_source !== orderUpdatePayload.payment_funding_source ||
    (order.stripe_charge_id || null) !== orderUpdatePayload.stripe_charge_id ||
    (order.stripe_balance_transaction_id || null) !==
      orderUpdatePayload.stripe_balance_transaction_id ||
    (order.stripe_funds_available_on || null) !==
      orderUpdatePayload.stripe_funds_available_on ||
    (order.stripe_funds_settled_at || null) !== orderUpdatePayload.stripe_funds_settled_at ||
    (order.stripe_settlement_status || null) !==
      orderUpdatePayload.stripe_settlement_status;

  if (changed) {
    const [orderUpdateResult, payoutUpdateResult] = await Promise.all([
      adminClient.from("orders").update(orderUpdatePayload).eq("id", order.id),
      adminClient.from("order_payouts").update(payoutUpdatePayload).eq("order_id", order.id),
    ]);

    if (orderUpdateResult.error) {
      throw new Error(orderUpdateResult.error.message || "Failed to update order settlement");
    }
    if (payoutUpdateResult.error) {
      throw new Error(
        payoutUpdateResult.error.message || "Failed to update order payout settlement"
      );
    }
  }

  return {
    orderId: order.id,
    sellerId: order.seller_id,
    paymentIntentId: order.stripe_payment_intent_id,
    paymentSourceType: snapshot.paymentSourceType,
    chargeId: orderUpdatePayload.stripe_charge_id,
    balanceTransactionId: orderUpdatePayload.stripe_balance_transaction_id,
    availableOn: orderUpdatePayload.stripe_funds_available_on,
    settledAt: orderUpdatePayload.stripe_funds_settled_at,
    status: orderUpdatePayload.stripe_settlement_status,
    retrievedFromStripe: snapshot.retrievedFromStripe,
    lookupError: snapshot.lookupError,
    changed,
  } satisfies OrderSettlementSyncResult;
}

async function logSettlementSyncEvent(
  adminClient: SupabaseAdminClient,
  input: {
    actorRole: AuditActorRole;
    actorUserId?: string | null;
    orderId: string;
    sellerId: string;
    source: string;
    result: OrderSettlementSyncResult;
  }
) {
  if (!input.result.changed && input.result.status !== "pending_settlement_unknown") {
    return;
  }

  await logRelayAuditEvent(adminClient, {
    actorRole: input.actorRole,
    actorUserId: input.actorUserId || null,
    orderId: input.orderId,
    sellerId: input.sellerId,
    eventType:
      input.result.status === "pending_settlement_unknown"
        ? "stripe.settlement_metadata_pending"
        : "stripe.settlement_metadata_synced",
    metadata: {
      source: input.source,
      paymentIntentId: input.result.paymentIntentId,
      paymentSourceType: input.result.paymentSourceType,
      chargeId: input.result.chargeId,
      balanceTransactionId: input.result.balanceTransactionId,
      availableOn: input.result.availableOn,
      settledAt: input.result.settledAt,
      settlementStatus: input.result.status,
      retrievedFromStripe: input.result.retrievedFromStripe,
      lookupError: input.result.lookupError,
    },
  });
}

export async function syncOrderStripeSettlementByOrderId(
  adminClient: SupabaseAdminClient,
  input: {
    orderId: string;
    source: string;
    actorRole: AuditActorRole;
    actorUserId?: string | null;
  }
) {
  const order = await loadOrderForSettlementById(adminClient, input.orderId);

  if (!order.stripe_payment_intent_id) {
    const result = await persistSettlementSnapshot(adminClient, order, {
      paymentSourceType:
        order.payment_funding_source === "relay_balance" ? "relay_balance" : "card",
      chargeId: null,
      balanceTransactionId: null,
      availableOn: null,
      settledAt: null,
      status:
        order.payment_funding_source === "relay_balance"
          ? "not_applicable"
          : "pending_settlement_unknown",
      retrievedFromStripe: false,
      lookupError:
        order.payment_funding_source === "relay_balance"
          ? null
          : "Order is missing Stripe payment_intent_id.",
    });

    await logSettlementSyncEvent(adminClient, {
      actorRole: input.actorRole,
      actorUserId: input.actorUserId,
      orderId: result.orderId,
      sellerId: result.sellerId,
      source: input.source,
      result,
    });

    return result;
  }

  const snapshot = await fetchStripeCardSettlementLookup(order.stripe_payment_intent_id, {
    orderId: order.id,
    source: input.source,
  });
  const result = await persistSettlementSnapshot(adminClient, order, snapshot);

  await logSettlementSyncEvent(adminClient, {
    actorRole: input.actorRole,
    actorUserId: input.actorUserId,
    orderId: result.orderId,
    sellerId: result.sellerId,
    source: input.source,
    result,
  });

  return result;
}

export async function syncOrderStripeSettlementByPaymentIntentId(
  adminClient: SupabaseAdminClient,
  input: {
    paymentIntentId: string;
    source: string;
    actorRole: AuditActorRole;
    actorUserId?: string | null;
  }
) {
  const order = await loadOrderForSettlementByPaymentIntentId(
    adminClient,
    input.paymentIntentId
  );

  if (!order) {
    console.info("No Relay order found for Stripe settlement sync", {
      paymentIntentId: input.paymentIntentId,
      source: input.source,
    });
    return null;
  }

  const snapshot = await fetchStripeCardSettlementLookup(input.paymentIntentId, {
    orderId: order.id,
    source: input.source,
  });
  const result = await persistSettlementSnapshot(adminClient, order, snapshot);

  await logSettlementSyncEvent(adminClient, {
    actorRole: input.actorRole,
    actorUserId: input.actorUserId,
    orderId: result.orderId,
    sellerId: result.sellerId,
    source: input.source,
    result,
  });

  return result;
}
