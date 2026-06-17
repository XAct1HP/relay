"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const payout_calculations_1 = require("../src/lib/payout-calculations");
function requireStep(schedule, key) {
    const step = (0, payout_calculations_1.getStepWithCumulativeBps)((0, payout_calculations_1.getPayoutStepDefinitions)(schedule), key);
    strict_1.default.ok(step, `Expected step ${key} for ${schedule}`);
    return step;
}
function run() {
    const tier1Step = requireStep("buyer_confirmation_or_review_expiry", "final_release");
    const tier1 = (0, payout_calculations_1.calculatePayoutAllocation)({
        sellerEarningsCents: 10000,
        reservePercentageBps: 1500,
        currentReserveBalanceCents: 0,
        minimumReserveBalanceCents: 0,
        cumulativeGrossReleasedCents: 0,
        cumulativeReserveWithheldCents: 0,
        step: tier1Step,
    });
    strict_1.default.equal(tier1.grossAmountCents, 10000);
    strict_1.default.equal(tier1.reserveWithheldCents, 1500);
    strict_1.default.equal(tier1.netPaidCents, 8500);
    const tier2Step = requireStep("delivery", "delivery_release");
    const tier2 = (0, payout_calculations_1.calculatePayoutAllocation)({
        sellerEarningsCents: 10000,
        reservePercentageBps: 500,
        currentReserveBalanceCents: 0,
        minimumReserveBalanceCents: 0,
        cumulativeGrossReleasedCents: 0,
        cumulativeReserveWithheldCents: 0,
        step: tier2Step,
    });
    strict_1.default.equal(tier2.reserveWithheldCents, 500);
    strict_1.default.equal(tier2.netPaidCents, 9500);
    const tier3First = requireStep("carrier_acceptance_and_delivery_split", "carrier_acceptance_release");
    const tier3FirstAllocation = (0, payout_calculations_1.calculatePayoutAllocation)({
        sellerEarningsCents: 10000,
        reservePercentageBps: 200,
        currentReserveBalanceCents: 49000,
        minimumReserveBalanceCents: 50000,
        cumulativeGrossReleasedCents: 0,
        cumulativeReserveWithheldCents: 0,
        step: tier3First,
    });
    strict_1.default.equal(tier3FirstAllocation.grossAmountCents, 5000);
    strict_1.default.equal(tier3FirstAllocation.reserveWithheldCents, 100);
    strict_1.default.equal(tier3FirstAllocation.minimumBalanceTopUpCents, 900);
    strict_1.default.equal(tier3FirstAllocation.netPaidCents, 4000);
    const tier3Second = requireStep("carrier_acceptance_and_delivery_split", "delivery_balance_release");
    const tier3SecondAllocation = (0, payout_calculations_1.calculatePayoutAllocation)({
        sellerEarningsCents: 10000,
        reservePercentageBps: 200,
        currentReserveBalanceCents: 50000,
        minimumReserveBalanceCents: 50000,
        cumulativeGrossReleasedCents: 5000,
        cumulativeReserveWithheldCents: 100,
        step: tier3Second,
    });
    strict_1.default.equal(tier3SecondAllocation.grossAmountCents, 5000);
    strict_1.default.equal(tier3SecondAllocation.reserveWithheldCents, 100);
    strict_1.default.equal(tier3SecondAllocation.minimumBalanceTopUpCents, 0);
    strict_1.default.equal(tier3SecondAllocation.netPaidCents, 4900);
    strict_1.default.equal((0, payout_calculations_1.resolveTargetRankForTrigger)("carrier_acceptance_and_delivery_split", "delivery"), 2);
    strict_1.default.equal((0, payout_calculations_1.resolveTargetRankForTrigger)("carrier_acceptance_and_delivery_split", "carrier_acceptance"), 1);
    strict_1.default.equal((0, payout_calculations_1.resolveTargetRankForTrigger)("carrier_acceptance_and_delivery_split", "manual_override"), 2);
    strict_1.default.equal((0, payout_calculations_1.inferPayoutStatus)({
        totalPaidCents: 0,
        totalExpectedPaidCents: 10000,
        isFrozen: true,
        isRefunded: false,
        hasFailures: false,
    }), "frozen");
    const idempotencyA = (0, payout_calculations_1.buildOrderPayoutIdempotencyKey)("order-123", "delivery_release");
    const idempotencyB = (0, payout_calculations_1.buildOrderPayoutIdempotencyKey)("order-123", "delivery_release");
    const idempotencyC = (0, payout_calculations_1.buildOrderPayoutIdempotencyKey)("order-123", "final_release");
    strict_1.default.equal(idempotencyA, idempotencyB);
    strict_1.default.notEqual(idempotencyA, idempotencyC);
    console.log("Payout calculation scenarios passed.");
}
run();
