import { NextResponse } from "next/server";
import { getRelayBalanceSnapshot } from "@/lib/money-policy";
import { createAdminClient } from "@/lib/supabase-admin";
import { createServerClientInstance } from "@/lib/supabase-server";

export async function GET() {
  try {
    const supabase = await createServerClientInstance();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const relayBalance = await getRelayBalanceSnapshot(user.id, {
      adminClient: createAdminClient(),
      actorRole: "buyer",
      actorUserId: user.id,
    });

    return NextResponse.json({
      balances: {
        pendingBalanceCents: relayBalance.pendingBalanceCents,
        availableBalanceCents: relayBalance.availableBalanceCents,
        updatedAt: relayBalance.updatedAt,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load Relay Balance",
      },
      { status: 500 }
    );
  }
}
