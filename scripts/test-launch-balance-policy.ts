import assert from "node:assert/strict";
import { calculateExposure, determineFundsEligibility } from "../src/lib/money-policy";

function isoOffset(hoursFromNow: number) {
  return new Date(Date.now() + hoursFromNow * 60 * 60 * 1000).toISOString();
}

function run() {
  const baseOrder = {
    price: 100,
    review_deadline: isoOffset(24),
    review_window_ends_at: isoOffset(24),
  };

  assert.equal(
    calculateExposure(
      {
        ...baseOrder,
        status: "delivered",
        delivered_at: isoOffset(-2),
        payment_funding_source: "card",
      },
      "tier_2"
    ),
    0,
    "Tier 2 delivery should not create exposure at launch."
  );

  assert.equal(
    calculateExposure(
      {
        ...baseOrder,
        status: "shipped",
        shipped_at: isoOffset(-2),
        payment_funding_source: "card",
      },
      "tier_3"
    ),
    0,
    "Tier 3 carrier acceptance should not create exposure at launch."
  );

  assert.equal(
    calculateExposure(
      {
        ...baseOrder,
        status: "completed",
        delivered_at: isoOffset(-6),
        payment_funding_source: "relay_balance",
      },
      "tier_1"
    ),
    0,
    "Buyer completion should not need to clear exposure because exposure is inactive."
  );

  const unsettledCard = determineFundsEligibility(
    {
      ...baseOrder,
      status: "completed",
      payment_funding_source: "card",
      stripe_funds_available_on: isoOffset(24),
    },
    "tier_3"
  );
  assert.equal(
    unsettledCard.eligibleAmountCents,
    0,
    "Card-funded proceeds must stay pending until settlement clears."
  );
  assert.equal(unsettledCard.pendingAmountCents, 10_000);

  const settledCard = determineFundsEligibility(
    {
      ...baseOrder,
      status: "completed",
      payment_funding_source: "card",
      stripe_funds_available_on: isoOffset(-24),
    },
    "tier_2"
  );
  assert.equal(
    settledCard.eligibleAmountCents,
    10_000,
    "Completed card-funded orders should become available once settlement clears."
  );

  const completedRelayBalanceOrder = determineFundsEligibility(
    {
      ...baseOrder,
      status: "completed",
      payment_funding_source: "relay_balance",
    },
    "tier_1"
  );
  assert.equal(
    completedRelayBalanceOrder.eligibleAmountCents,
    10_000,
    "Completed Relay-balance-funded orders should become available without Stripe settlement."
  );

  const deliveredButIncomplete = determineFundsEligibility(
    {
      ...baseOrder,
      status: "delivered",
      delivered_at: isoOffset(-4),
      payment_funding_source: "relay_balance",
    },
    "tier_2"
  );
  assert.equal(
    deliveredButIncomplete.eligibleAmountCents,
    0,
    "Available balance should still wait for Relay order completion."
  );

  console.log("Launch balance policy scenarios passed.");
}

run();
