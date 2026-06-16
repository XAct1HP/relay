import "server-only";

import crypto from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

const TEST_KEY_PREFIX = "relay_sk_test_";
const LIVE_KEY_PREFIX = "relay_sk_live_";
const KEY_SECRET_HEX_LENGTH = 48;
const KEY_PREFIX_VISIBLE_SECRET_LENGTH = 8;
const MAX_KEY_NAME_LENGTH = 80;

export interface SellerApiKeyRecord {
  id: string;
  seller_id: string;
  key_prefix: string;
  name: string;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

interface ApprovedSellerProfile {
  id: string;
  role: string;
  seller_application_status: string;
  stripe_connect_onboarding_complete?: boolean;
  seller_identity_review_required?: boolean;
  is_founding_seller?: boolean;
  is_banned?: boolean;
}

export class SellerApiKeyError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "SellerApiKeyError";
    this.code = code;
  }
}

export function getSellerApiKeyBasePrefix() {
  return process.env.VERCEL_ENV === "production" ? LIVE_KEY_PREFIX : TEST_KEY_PREFIX;
}

export function normalizeSellerApiKeyName(name: string) {
  const normalized = String(name || "").trim();

  if (!normalized) {
    throw new SellerApiKeyError("invalid_name", "Enter a name for this API key.");
  }

  if (normalized.length > MAX_KEY_NAME_LENGTH) {
    throw new SellerApiKeyError(
      "invalid_name",
      `API key names must be ${MAX_KEY_NAME_LENGTH} characters or fewer.`
    );
  }

  return normalized;
}

export function hashSellerApiKey(apiKey: string) {
  return crypto.createHash("sha256").update(apiKey).digest("hex");
}

export async function requireApprovedSellerProfile(
  supabase: SupabaseClient,
  userId: string
): Promise<ApprovedSellerProfile> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, role, seller_application_status, stripe_connect_onboarding_complete, seller_identity_review_required, is_founding_seller, is_banned")
    .eq("id", userId)
    .single();

  if (error || !data) {
    throw new SellerApiKeyError("profile_not_found", "Could not load your seller profile.");
  }

  if (data.role !== "seller" || data.seller_application_status !== "approved") {
    throw new SellerApiKeyError(
      "seller_not_approved",
      "Only approved sellers can manage Relay API keys."
    );
  }

  if (!data.stripe_connect_onboarding_complete) {
    throw new SellerApiKeyError(
      "stripe_not_complete",
      "Complete Stripe Connect onboarding before managing Relay API keys."
    );
  }

  if (data.is_banned) {
    throw new SellerApiKeyError(
      "identity_review_required",
      "Seller account is not eligible for API access while identity review is pending."
    );
  }

  if (data.seller_identity_review_required && !data.is_founding_seller) {
    throw new SellerApiKeyError(
      "identity_review_required",
      "Seller account is not eligible for API access while identity review is pending."
    );
  }

  return data;
}

export async function listSellerApiKeys(
  supabase: SupabaseClient,
  sellerId: string
): Promise<SellerApiKeyRecord[]> {
  const { data, error } = await supabase
    .from("seller_api_keys")
    .select("id, seller_id, key_prefix, name, last_used_at, revoked_at, created_at")
    .eq("seller_id", sellerId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new SellerApiKeyError("list_failed", error.message);
  }

  return (data || []) as SellerApiKeyRecord[];
}

export async function createSellerApiKey(
  supabase: SupabaseClient,
  input: {
    sellerId: string;
    name: string;
  }
) {
  const normalizedName = normalizeSellerApiKeyName(input.name);
  const keyBasePrefix = getSellerApiKeyBasePrefix();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const secret = crypto.randomBytes(KEY_SECRET_HEX_LENGTH / 2).toString("hex");
    const plaintextKey = `${keyBasePrefix}${secret}`;
    const keyHash = hashSellerApiKey(plaintextKey);
    const keyPrefix = `${keyBasePrefix}${secret.slice(0, KEY_PREFIX_VISIBLE_SECRET_LENGTH)}`;

    const { data, error } = await supabase
      .from("seller_api_keys")
      .insert({
        seller_id: input.sellerId,
        key_hash: keyHash,
        key_prefix: keyPrefix,
        name: normalizedName,
      })
      .select("id, seller_id, key_prefix, name, last_used_at, revoked_at, created_at")
      .single();

    if (!error && data) {
      return {
        apiKey: plaintextKey,
        record: data as SellerApiKeyRecord,
      };
    }

    if ((error as { code?: string } | null)?.code !== "23505" || attempt === 2) {
      throw new SellerApiKeyError(
        "create_failed",
        error?.message || "Failed to create this API key."
      );
    }
  }

  throw new SellerApiKeyError("create_failed", "Failed to create this API key.");
}

export async function revokeSellerApiKey(
  supabase: SupabaseClient,
  input: {
    sellerId: string;
    keyId: string;
  }
) {
  const keyId = String(input.keyId || "").trim();
  if (!keyId) {
    throw new SellerApiKeyError("invalid_key_id", "A valid API key is required.");
  }

  const { data: existingKey, error: lookupError } = await supabase
    .from("seller_api_keys")
    .select("id, seller_id, revoked_at")
    .eq("id", keyId)
    .eq("seller_id", input.sellerId)
    .maybeSingle();

  if (lookupError) {
    throw new SellerApiKeyError("lookup_failed", lookupError.message);
  }

  if (!existingKey) {
    throw new SellerApiKeyError("not_found", "This API key could not be found.");
  }

  if (existingKey.revoked_at) {
    return {
      id: existingKey.id,
      revoked_at: existingKey.revoked_at,
    };
  }

  const revokedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from("seller_api_keys")
    .update({ revoked_at: revokedAt })
    .eq("id", keyId)
    .eq("seller_id", input.sellerId)
    .select("id, revoked_at")
    .single();

  if (error || !data) {
    throw new SellerApiKeyError(
      "revoke_failed",
      error?.message || "Failed to revoke this API key."
    );
  }

  return data;
}
