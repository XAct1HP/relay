import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { assertCronAuthorized } from "@/lib/cron-auth";
import { runAutoCompleteReviewWindowJob } from "@/lib/background-jobs";

export async function GET(request: NextRequest) {
  try {
    assertCronAuthorized(request);
    const result = await runAutoCompleteReviewWindowJob(createAdminClient());

    return NextResponse.json({
      message: `Auto-complete finished: ${result.completed} completed, ${result.failed} blocked or failed`,
      ...result,
    });
  } catch (error) {
    console.error("Auto-complete cron error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Auto-complete cron failed" },
      { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 500 }
    );
  }
}
