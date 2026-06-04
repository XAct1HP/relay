import "server-only";

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { hashSellerApiKey } from "@/lib/seller-api-keys";

const VALID_API_KEY_PREFIXES = ["relay_sk_test_", "relay_sk_live_"] as const;

interface SellerApiKeyLookupRow {
  id: string;
  seller_id: string;
  key_prefix: string;
  revoked_at: string | null;
}

interface SellerApprovalRow {
  id: string;
  role: string;
  seller_application_status: string;
}

export interface AuthenticatedIntegrationSeller {
  sellerId: string;
  apiKeyId: string;
  apiKeyPrefix: string;
}

export class IntegrationAuthError extends Error {
  code: "invalid_api_key" | "seller_not_approved" | "rate_limited";
  status: 401 | 403 | 429;

  constructor(
    code: "invalid_api_key" | "seller_not_approved" | "rate_limited",
    message: string,
    status: 401 | 403 | 429
  ) {
    super(message);
    this.name = "IntegrationAuthError";
    this.code = code;
    this.status = status;
  }
}

export async function authenticateIntegrationRequest(
  request: Request
): Promise<AuthenticatedIntegrationSeller> {
  const apiKey = extractBearerApiKey(request);

  if (!apiKey || !hasValidApiKeyPrefix(apiKey)) {
    throw new IntegrationAuthError("invalid_api_key", "Invalid API key.", 401);
  }

  const admin = createAdminClient();
  const keyHash = hashSellerApiKey(apiKey);

  const { data: apiKeyRow, error: apiKeyError } = await admin
    .from("seller_api_keys")
    .select("id, seller_id, key_prefix, revoked_at")
    .eq("key_hash", keyHash)
    .maybeSingle();

  if (apiKeyError) {
    console.error("Integration API key lookup failed:", apiKeyError);
    throw new IntegrationAuthError("invalid_api_key", "Invalid API key.", 401);
  }

  const matchedKey = apiKeyRow as SellerApiKeyLookupRow | null;
  if (!matchedKey || matchedKey.revoked_at) {
    throw new IntegrationAuthError("invalid_api_key", "Invalid API key.", 401);
  }

  const { data: sellerProfile, error: sellerError } = await admin
    .from("profiles")
    .select("id, role, seller_application_status")
    .eq("id", matchedKey.seller_id)
    .maybeSingle();

  if (sellerError) {
    console.error("Integration seller approval lookup failed:", sellerError);
    throw new IntegrationAuthError("invalid_api_key", "Invalid API key.", 401);
  }

  const seller = sellerProfile as SellerApprovalRow | null;
  if (!seller) {
    throw new IntegrationAuthError("invalid_api_key", "Invalid API key.", 401);
  }

  if (seller.role !== "seller" || seller.seller_application_status !== "approved") {
    throw new IntegrationAuthError("seller_not_approved", "Seller not approved.", 403);
  }

  const { error: touchError } = await admin
    .from("seller_api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", matchedKey.id);

  if (touchError) {
    console.error("Integration API key last_used_at update failed:", touchError);
  }

  return {
    sellerId: matchedKey.seller_id,
    apiKeyId: matchedKey.id,
    apiKeyPrefix: matchedKey.key_prefix,
  };
}

export function createIntegrationAuthErrorResponse(error: unknown) {
  if (error instanceof IntegrationAuthError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error("Unexpected integration auth error:", error);
  return NextResponse.json({ error: "Invalid API key." }, { status: 401 });
}

function extractBearerApiKey(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  const [scheme, token] = authorization.split(" ");

  if (!scheme || !token || scheme.toLowerCase() !== "bearer") {
    return "";
  }

  return token.trim();
}

function hasValidApiKeyPrefix(apiKey: string) {
  return VALID_API_KEY_PREFIXES.some((prefix) => apiKey.startsWith(prefix));
}
