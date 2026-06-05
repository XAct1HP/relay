import "server-only";

import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import {
  authenticateIntegrationRequest,
  IntegrationAuthError,
  type AuthenticatedIntegrationSeller,
} from "@/lib/integration-auth";
import { IntegrationInventoryError } from "@/lib/integration-inventory";
import { logIntegrationApiRequest } from "@/lib/integration-logging";
import { createAdminClient } from "@/lib/supabase-admin";

interface HandleIntegrationRouteOptions<TBody = unknown> {
  request: Request;
  handler: (args: {
    admin: ReturnType<typeof createAdminClient>;
    auth: AuthenticatedIntegrationSeller;
    body: TBody;
    requestId: string;
  }) => Promise<unknown>;
}

export async function handleIntegrationRoute<TBody = unknown>(
  options: HandleIntegrationRouteOptions<TBody>
) {
  const { request, handler } = options;
  const requestId = randomUUID();
  const admin = createAdminClient();
  const endpoint = new URL(request.url).pathname;
  const method = request.method.toUpperCase();

  let auth: AuthenticatedIntegrationSeller | null = null;
  let statusCode = 500;
  let errorCode: string | null = "internal_error";
  let responseBody: unknown = { error: "Internal server error." };

  try {
    auth = await authenticateIntegrationRequest(request);
    const body = (await request.json()) as TBody;
    const result = await handler({
      admin,
      auth,
      body,
      requestId,
    });

    statusCode = 200;
    errorCode = null;
    responseBody = result;
  } catch (error) {
    if (error instanceof IntegrationAuthError) {
      statusCode = error.status;
      errorCode = error.code;
      responseBody = { error: error.message };
    } else if (error instanceof IntegrationInventoryError) {
      statusCode = 400;
      errorCode = error.code;
      responseBody = { error: error.message };
    } else if (error instanceof SyntaxError) {
      statusCode = 400;
      errorCode = "invalid_json";
      responseBody = { error: "Request body must be valid JSON." };
    } else {
      console.error("Integration route error:", error);
      responseBody = { error: "Failed to process integration request." };
    }
  }

  await logIntegrationApiRequest(admin, {
    sellerId: auth?.sellerId || null,
    apiKeyId: auth?.apiKeyId || null,
    endpoint,
    method,
    statusCode,
    requestId,
    errorCode,
  });

  return NextResponse.json(responseBody, {
    status: statusCode,
    headers: {
      "x-relay-request-id": requestId,
    },
  });
}
