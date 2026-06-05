import { NextResponse } from "next/server";
import {
  authenticateIntegrationRequest,
  createIntegrationAuthErrorResponse,
  IntegrationAuthError,
} from "@/lib/integration-auth";
import {
  IntegrationInventoryError,
  processIntegrationPriceUpdates,
} from "@/lib/integration-inventory";
import { createAdminClient } from "@/lib/supabase-admin";

export async function PATCH(request: Request) {
  try {
    const auth = await authenticateIntegrationRequest(request);
    const body = await request.json();
    const admin = createAdminClient();

    const report = await processIntegrationPriceUpdates(admin, auth.sellerId, body?.updates);

    return NextResponse.json(report);
  } catch (error) {
    if (error instanceof IntegrationInventoryError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
    }

    if (error instanceof IntegrationAuthError) {
      return createIntegrationAuthErrorResponse(error);
    }

    console.error("Integration inventory price update error:", error);
    return NextResponse.json(
      { error: "Failed to process inventory price update request." },
      { status: 500 }
    );
  }
}
