import { NextResponse } from "next/server";
import {
  authenticateIntegrationRequest,
  createIntegrationAuthErrorResponse,
  IntegrationAuthError,
} from "@/lib/integration-auth";
import {
  IntegrationInventoryError,
  processIntegrationListingDeactivate,
} from "@/lib/integration-inventory";
import { createAdminClient } from "@/lib/supabase-admin";

export async function POST(request: Request) {
  try {
    const auth = await authenticateIntegrationRequest(request);
    const body = await request.json();
    const admin = createAdminClient();

    const result = await processIntegrationListingDeactivate(admin, auth.sellerId, body);

    return NextResponse.json(result);
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

    console.error("Integration inventory listing deactivate error:", error);
    return NextResponse.json(
      { error: "Failed to process inventory listing deactivate request." },
      { status: 500 }
    );
  }
}
