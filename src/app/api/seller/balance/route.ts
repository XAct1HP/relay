import { NextResponse } from "next/server";
import { getRelayBalanceSnapshot, WITHDRAWAL_TRANSFER_FEE_CENTS } from "@/lib/money-policy";
import { runCompletedOrderFundsAvailabilityJob } from "@/lib/background-jobs";
import { requireSellerSession } from "@/lib/seller-access";

export async function GET() {
  try {
    const { user, profile, adminClient } = await requireSellerSession();
    await runCompletedOrderFundsAvailabilityJob(adminClient, {
      sellerId: user.id,
      actorRole: "seller",
      actorUserId: user.id,
    });
    const relayBalance = await getRelayBalanceSnapshot(user.id, {
      adminClient,
      actorRole: "seller",
      actorUserId: user.id,
    });

    const { data: withdrawals, error: withdrawalsError } = await adminClient
      .from("withdrawal_requests")
      .select("*")
      .eq("seller_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10);

    if (withdrawalsError) {
      throw new Error(withdrawalsError.message || "Failed to load withdrawal history");
    }

    const { data: activityRows, error: activityError } = await adminClient
      .from("relay_balance_ledger")
      .select(`
        id,
        order_id,
        type,
        amount_cents,
        status,
        metadata,
        created_at,
        order:orders(
          id,
          status,
          listing:listings(
            brand,
            model
          )
        )
      `)
      .eq("seller_id", user.id)
      .order("created_at", { ascending: false })
      .limit(12);

    if (activityError) {
      throw new Error(activityError.message || "Failed to load balance activity");
    }

    return NextResponse.json({
      profile: {
        id: profile.id,
        stripeAccountId: profile.stripe_account_id,
        stripeConnected: Boolean(profile.stripe_account_id),
        sellerTier: profile.seller_tier || "tier_1",
        displayName:
          profile.display_name || profile.full_name || profile.username || profile.email || "Seller",
      },
      balances: {
        relayBalanceCents: relayBalance.totalBalanceCents,
        pendingBalanceCents: relayBalance.pendingBalanceCents,
        availableBalanceCents: relayBalance.availableBalanceCents,
        currentExposureCents: relayBalance.exposureCents,
        withdrawableBalanceCents: relayBalance.withdrawableBalanceCents,
        updatedAt: relayBalance.updatedAt,
      },
      withdrawalConfig: {
        transferFeeCents: WITHDRAWAL_TRANSFER_FEE_CENTS,
      },
      withdrawals: withdrawals || [],
      activity: (activityRows || []).map((row: any) => ({
        ...row,
        order: Array.isArray(row.order) ? row.order[0] || null : row.order || null,
      })),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load seller balance";

    return NextResponse.json(
      { error: message },
      { status: message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500 }
    );
  }
}
