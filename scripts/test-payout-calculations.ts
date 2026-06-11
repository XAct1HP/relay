import assert from "node:assert/strict";
import {
  buildOrderPayoutIdempotencyKey,
  calculatePayoutAllocation,
  getPayoutStepDefinitions,
  getStepWithCumulativeBps,
  inferPayoutStatus,
  resolveTargetRankForTrigger,
} from "../src/lib/payout-calculations";

function requireStep(
  schedule: Parameters<typeof getPayoutStepDefinitions>[0],
  key: Parameters<typeof getStepWithCumulativeBps>[1]
) {
  const step = getStepWithCumulativeBps(getPayoutStepDefinitions(schedule), key);
  assert.ok(step, `Expected step ${key} for ${schedule}`);
  return step!;
}

function run() {
  const tier1Step = requireStep(
    "buyer_confirmation_or_review_expiry",
    "final_release"
  );
  const tier1 = calculatePayoutAllocation({
    sellerEarningsCents: 10_000,
    reservePercentageBps: 1500,
    currentReserveBalanceCents: 0,
    minimumReserveBalanceCents: 0,
    cumulativeGrossReleasedCents: 0,
    cumulativeReserveWithheldCents: 0,
    step: tier1Step,
  });
  assert.equal(tier1.grossAmountCents, 10_000);
  assert.equal(tier1.reserveWithheldCents, 1_500);
  assert.equal(tier1.netPaidCents, 8_500);

  const tier2Step = requireStep("delivery", "delivery_release");
  const tier2 = calculatePayoutAllocation({
    sellerEarningsCents: 10_000,
    reservePercentageBps: 500,
    currentReserveBalanceCents: 0,
    minimumReserveBalanceCents: 0,
    cumulativeGrossReleasedCents: 0,
    cumulativeReserveWithheldCents: 0,
    step: tier2Step,
  });
  assert.equal(tier2.reserveWithheldCents, 500);
  assert.equal(tier2.netPaidCents, 9_500);

  const tier3First = requireStep(
    "carrier_acceptance_and_delivery_split",
    "carrier_acceptance_release"
  );
  const tier3FirstAllocation = calculatePayoutAllocation({
    sellerEarningsCents: 10_000,
    reservePercentageBps: 200,
    currentReserveBalanceCents: 49_000,
    minimumReserveBalanceCents: 50_000,
    cumulativeGrossReleasedCents: 0,
    cumulativeReserveWithheldCents: 0,
    step: tier3First,
  });
  assert.equal(tier3FirstAllocation.grossAmountCents, 5_000);
  assert.equal(tier3FirstAllocation.reserveWithheldCents, 100);
  assert.equal(tier3FirstAllocation.minimumBalanceTopUpCents, 900);
  assert.equal(tier3FirstAllocation.netPaidCents, 4_000);

  const tier3Second = requireStep(
    "carrier_acceptance_and_delivery_split",
    "delivery_balance_release"
  );
  const tier3SecondAllocation = calculatePayoutAllocation({
    sellerEarningsCents: 10_000,
    reservePercentageBps: 200,
    currentReserveBalanceCents: 50_000,
    minimumReserveBalanceCents: 50_000,
    cumulativeGrossReleasedCents: 5_000,
    cumulativeReserveWithheldCents: 100,
    step: tier3Second,
  });
  assert.equal(tier3SecondAllocation.grossAmountCents, 5_000);
  assert.equal(tier3SecondAllocation.reserveWithheldCents, 100);
  assert.equal(tier3SecondAllocation.minimumBalanceTopUpCents, 0);
  assert.equal(tier3SecondAllocation.netPaidCents, 4_900);

  assert.equal(
    resolveTargetRankForTrigger(
      "carrier_acceptance_and_delivery_split",
      "manual_override"
    ),
    2
  );
  assert.equal(
    inferPayoutStatus({
      totalPaidCents: 0,
      totalExpectedPaidCents: 10_000,
      isFrozen: true,
      isRefunded: false,
      hasFailures: false,
    }),
    "frozen"
  );

  const idempotencyA = buildOrderPayoutIdempotencyKey(
    "order-123",
    "delivery_release"
  );
  const idempotencyB = buildOrderPayoutIdempotencyKey(
    "order-123",
    "delivery_release"
  );
  const idempotencyC = buildOrderPayoutIdempotencyKey(
    "order-123",
    "final_release"
  );
  assert.equal(idempotencyA, idempotencyB);
  assert.notEqual(idempotencyA, idempotencyC);

  console.log("Payout calculation scenarios passed.");
}

run();
