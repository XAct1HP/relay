import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { assertCronAuthorized } from "@/lib/cron-auth";
import { runMonthlyTier3TagReplenishmentJob } from "@/lib/background-jobs";

export async function GET(request: NextRequest) {
  try {
    assertCronAuthorized(request);
    const result = await runMonthlyTier3TagReplenishmentJob(createAdminClient());

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to run tag replenishment cron" },
      { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 500 }
    );
  }
}
