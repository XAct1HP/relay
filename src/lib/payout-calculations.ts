export type PayoutSchedule =
  | "buyer_confirmation_or_review_expiry"
  | "delivery"
  | "carrier_acceptance_and_delivery_split";

export type OrderPayoutTrigger =
  | "buyer_confirmation"
  | "review_window_expiry"
  | "delivery"
  | "carrier_acceptance"
  | "manual_override";

export type OrderPayoutStepKey =
  | "final_release"
  | "delivery_release"
  | "carrier_acceptance_release"
  | "delivery_balance_release"
  | "manual_override_release";

export interface OrderPayoutPolicySnapshot {
  payoutSchedule: PayoutSchedule;
  reservePercentageBps: number;
  reserveHoldDurationDays: number | null;
  minimumReserveBalanceCents: number;
}

export interface PayoutStepDefinition {
  key: OrderPayoutStepKey;
  label: string;
  percentageBps: number;
  rank: number;
  triggers: OrderPayoutTrigger[];
}

export interface PayoutAllocationInput {
  sellerEarningsCents: number;
  reservePercentageBps: number;
  currentReserveBalanceCents: number;
  minimumReserveBalanceCents: number;
  cumulativeGrossReleasedCents: number;
  cumulativeReserveWithheldCents: number;
  step: PayoutStepDefinition & { rankAwareCumulativeBps: number };
}

export interface PayoutAllocationResult {
  grossAmountCents: number;
  reserveWithheldCents: number;
  minimumBalanceTopUpCents: number;
  netPaidCents: number;
}

export function getPayoutStepDefinitions(
  payoutSchedule: PayoutSchedule
): PayoutStepDefinition[] {
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

export function resolveTargetRankForTrigger(
  payoutSchedule: PayoutSchedule,
  trigger: OrderPayoutTrigger
) {
  const steps = getPayoutStepDefinitions(payoutSchedule);
  if (trigger === "manual_override") {
    return steps.reduce((max, step) => Math.max(max, step.rank), 0);
  }

  const matchingStep = steps.find((step) => step.triggers.includes(trigger));

  return matchingStep?.rank || null;
}

export function calculatePayoutAllocation(
  input: PayoutAllocationInput
): PayoutAllocationResult {
  const totalReserveRequired = Math.round(
    (input.sellerEarningsCents * input.reservePercentageBps) / 10000
  );
  const cumulativeGrossTarget = Math.round(
    (input.sellerEarningsCents * input.step.rankAwareCumulativeBps) / 10000
  );
  const cumulativeReserveTarget = Math.round(
    (totalReserveRequired * input.step.rankAwareCumulativeBps) / 10000
  );

  const grossAmountCents = Math.max(
    0,
    cumulativeGrossTarget - input.cumulativeGrossReleasedCents
  );
  const reserveWithheldCents = Math.max(
    0,
    cumulativeReserveTarget - input.cumulativeReserveWithheldCents
  );
  const payoutableAfterReserve = Math.max(0, grossAmountCents - reserveWithheldCents);
  const missingMinimumReserve = Math.max(
    0,
    input.minimumReserveBalanceCents -
      (input.currentReserveBalanceCents + reserveWithheldCents)
  );
  const minimumBalanceTopUpCents = Math.min(
    payoutableAfterReserve,
    missingMinimumReserve
  );

  return {
    grossAmountCents,
    reserveWithheldCents,
    minimumBalanceTopUpCents,
    netPaidCents: Math.max(
      0,
      grossAmountCents - reserveWithheldCents - minimumBalanceTopUpCents
    ),
  };
}

export function getStepWithCumulativeBps(
  steps: PayoutStepDefinition[],
  stepKey: OrderPayoutStepKey
) {
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

export function buildOrderPayoutIdempotencyKey(
  orderId: string,
  stepKey: OrderPayoutStepKey
) {
  return `order-payout-${orderId}-${stepKey}`;
}

export function inferPayoutStatus(input: {
  totalPaidCents: number;
  totalExpectedPaidCents: number;
  isFrozen: boolean;
  isRefunded: boolean;
  hasFailures: boolean;
}) {
  if (input.isRefunded) return "refunded";
  if (input.isFrozen) return "frozen";
  if (input.hasFailures) return "failed";
  if (input.totalPaidCents <= 0) return "pending";
  if (input.totalPaidCents >= input.totalExpectedPaidCents) return "paid";
  return "partially_paid";
}
