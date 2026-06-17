"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPayoutStepDefinitions = getPayoutStepDefinitions;
exports.resolveTargetRankForTrigger = resolveTargetRankForTrigger;
exports.calculatePayoutAllocation = calculatePayoutAllocation;
exports.getStepWithCumulativeBps = getStepWithCumulativeBps;
exports.buildOrderPayoutIdempotencyKey = buildOrderPayoutIdempotencyKey;
exports.inferPayoutStatus = inferPayoutStatus;
function getPayoutStepDefinitions(payoutSchedule) {
    if (payoutSchedule === "carrier_acceptance_and_delivery_split") {
        return [
            {
                key: "carrier_acceptance_release",
                label: "Carrier Acceptance Release",
                percentageBps: 5000,
                rank: 1,
                triggers: ["carrier_acceptance", "delivery", "manual_override"],
            },
            {
                key: "delivery_balance_release",
                label: "Delivery Balance Release",
                percentageBps: 5000,
                rank: 2,
                triggers: ["delivery", "manual_override"],
            },
        ];
    }
    if (payoutSchedule === "delivery") {
        return [
            {
                key: "delivery_release",
                label: "Delivery Release",
                percentageBps: 10000,
                rank: 1,
                triggers: ["delivery", "manual_override"],
            },
        ];
    }
    return [
        {
            key: "final_release",
            label: "Final Release",
            percentageBps: 10000,
            rank: 1,
            triggers: ["buyer_confirmation", "review_window_expiry", "manual_override"],
        },
    ];
}
function resolveTargetRankForTrigger(payoutSchedule, trigger) {
    const steps = getPayoutStepDefinitions(payoutSchedule);
    if (trigger === "manual_override") {
        return steps.reduce((max, step) => Math.max(max, step.rank), 0);
    }
    const matchingRanks = steps
        .filter((step) => step.triggers.includes(trigger))
        .map((step) => step.rank);
    if (matchingRanks.length === 0) {
        return null;
    }
    return Math.max(...matchingRanks);
}
function calculatePayoutAllocation(input) {
    const totalReserveRequired = Math.round((input.sellerEarningsCents * input.reservePercentageBps) / 10000);
    const cumulativeGrossTarget = Math.round((input.sellerEarningsCents * input.step.rankAwareCumulativeBps) / 10000);
    const cumulativeReserveTarget = Math.round((totalReserveRequired * input.step.rankAwareCumulativeBps) / 10000);
    const grossAmountCents = Math.max(0, cumulativeGrossTarget - input.cumulativeGrossReleasedCents);
    const reserveWithheldCents = Math.max(0, cumulativeReserveTarget - input.cumulativeReserveWithheldCents);
    const payoutableAfterReserve = Math.max(0, grossAmountCents - reserveWithheldCents);
    const missingMinimumReserve = Math.max(0, input.minimumReserveBalanceCents -
        (input.currentReserveBalanceCents + reserveWithheldCents));
    const minimumBalanceTopUpCents = Math.min(payoutableAfterReserve, missingMinimumReserve);
    return {
        grossAmountCents,
        reserveWithheldCents,
        minimumBalanceTopUpCents,
        netPaidCents: Math.max(0, grossAmountCents - reserveWithheldCents - minimumBalanceTopUpCents),
    };
}
function getStepWithCumulativeBps(steps, stepKey) {
    const step = steps.find((candidate) => candidate.key === stepKey);
    if (!step) {
        return null;
    }
    return {
        ...step,
        rankAwareCumulativeBps: steps
            .filter((candidate) => candidate.rank <= step.rank)
            .reduce((sum, candidate) => sum + candidate.percentageBps, 0),
    };
}
function buildOrderPayoutIdempotencyKey(orderId, stepKey) {
    return `order-payout-${orderId}-${stepKey}`;
}
function inferPayoutStatus(input) {
    if (input.isRefunded)
        return "refunded";
    if (input.isFrozen)
        return "frozen";
    if (input.hasFailures)
        return "failed";
    if (input.totalPaidCents <= 0)
        return "pending";
    if (input.totalPaidCents >= input.totalExpectedPaidCents)
        return "paid";
    return "partially_paid";
}
