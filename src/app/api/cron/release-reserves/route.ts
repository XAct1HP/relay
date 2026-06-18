import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { assertCronAuthorized } from "@/lib/cron-auth";
import {
  runPayoutSettlementReconciliationJob,
  runReserveReleaseJob,
} from "@/lib/background-jobs";

export async function GET(request: NextRequest) {
  try {
    assertCronAuthorized(request);
    const adminClient = createAdminClient();
    const [reserveResult, fundsResult] = await Promise.all([
      runReserveReleaseJob(adminClient),
      runPayoutSettlementReconciliationJob(adminClient, {
        actorRole: "system",
      }),
    ]);

    return NextResponse.json({
      success: true,
      reserveResult,
      fundsResult,
      reconciliationResult: fundsResult,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to release reserves" },
      { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 500 }
    );
  }
}
