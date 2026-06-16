import "server-only";

import crypto from "crypto";
import Stripe from "stripe";
import { logRelayAuditEvent } from "@/lib/relay-audit";
import { createAdminClient } from "@/lib/supabase-admin";
import { isRelayTestModeEnabled, isRelayTestSellerEmail } from "@/lib/test-mode";

type SupabaseAdminClient = ReturnType<typeof createAdminClient>;

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-06-20",
});

type IdentityVerificationStatus =
  | "unverified"
  | "pending"
  | "verified"
  | "restricted"
  | "review_required";

type AuditActorRole = "system" | "admin" | "seller" | "buyer";

interface SellerIdentityProfileRow {
  id: string;
  seller_id: string;
  identity_fingerprint: string | null;
  phone_fingerprint: string | null;
  email_fingerprint: string | null;
  bank_account_fingerprint: string | null;
  country_code: string | null;
  stripe_account_id: string | null;
  verification_status: IdentityVerificationStatus;
  stripe_connect_onboarding_complete: boolean;
  matched_banned_identity: boolean;
  matched_banned_identity_id: string | null;
  match_reasons: string[];
  admin_review_required: boolean;
  false_positive_cleared: boolean;
  false_positive_cleared_at: string | null;
  false_positive_cleared_by_admin_id: string | null;
  banned_identity: boolean;
  banned_reason: string | null;
  created_at: string;
  updated_at: string;
}

interface SellerProfileIdentitySeed {
  id: string;
  email: string | null;
  full_name: string | null;
  display_name: string | null;
  username: string | null;
  role: string;
  stripe_account_id: string | null;
  stripe_connect_onboarding_complete?: boolean | null;
  stripe_identity_verification_status?: IdentityVerificationStatus | null;
  seller_identity_review_required?: boolean | null;
  seller_identity_review_reason?: string | null;
  is_banned?: boolean | null;
  ban_reason?: string | null;
  ship_from_address?: {
    country?: string | null;
  } | null;
  is_founding_seller?: boolean | null;
}

interface StripeIdentitySnapshot {
  stripeAccountId: string | null;
  onboardingComplete: boolean;
  verificationStatus: IdentityVerificationStatus;
  legalName: string | null;
  dob: string | null;
  countryCode: string | null;
  bankFingerprint: string | null;
  bankLast4: string | null;
  phone: string | null;
  email: string | null;
  rawStatusReason: string | null;
}

interface IdentityMatchRecord {
  id: string;
  seller_id: string;
  reasons: string[];
  banned_reason: string | null;
}

export interface SellerIdentitySyncResult {
  identityProfile: SellerIdentityProfileRow;
  onboardingComplete: boolean;
  verificationStatus: IdentityVerificationStatus;
  adminReviewRequired: boolean;
  bannedIdentityMatch: boolean;
  matchReasons: string[];
}

function getAdminClient(client?: SupabaseAdminClient) {
  return client || createAdminClient();
}

function getIdentitySalt() {
  return (
    process.env.RELAY_IDENTITY_FINGERPRINT_SALT ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.STRIPE_SECRET_KEY ||
    "relay-local-identity-salt"
  );
}

function normalizeValue(value: string | null | undefined) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizePhone(value: string | null | undefined) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits || "";
}

function hashFingerprint(namespace: string, value: string | null | undefined) {
  const normalized = normalizeValue(value);
  if (!normalized) {
    return null;
  }

  return crypto
    .createHash("sha256")
    .update(`${getIdentitySalt()}:${namespace}:${normalized}`)
    .digest("hex");
}

function hashPhoneFingerprint(value: string | null | undefined) {
  const normalized = normalizePhone(value);
  if (!normalized) {
    return null;
  }

  return crypto
    .createHash("sha256")
    .update(`${getIdentitySalt()}:phone:${normalized}`)
    .digest("hex");
}

function buildIdentityFingerprint(input: {
  legalName?: string | null;
  dob?: string | null;
  countryCode?: string | null;
  bankFingerprint?: string | null;
  bankLast4?: string | null;
  email?: string | null;
  stripeAccountId?: string | null;
}) {
  const stableFields = [
    normalizeValue(input.legalName),
    normalizeValue(input.dob),
    normalizeValue(input.countryCode),
    normalizeValue(input.bankFingerprint),
    normalizeValue(input.bankLast4),
  ].filter(Boolean);

  const fallbackFields = [
    normalizeValue(input.legalName),
    normalizeValue(input.countryCode),
    normalizeValue(input.email),
    normalizeValue(input.stripeAccountId),
  ].filter(Boolean);

  const fieldsToHash = stableFields.length >= 2 ? stableFields : fallbackFields;
  if (fieldsToHash.length === 0) {
    return null;
  }

  return crypto
    .createHash("sha256")
    .update(`${getIdentitySalt()}:identity:${fieldsToHash.join("|")}`)
    .digest("hex");
}

function deriveVerificationStatus(account: any): IdentityVerificationStatus {
  const requirements = account?.requirements || {};
  const disabledReason =
    requirements?.disabled_reason ||
    account?.future_requirements?.disabled_reason ||
    null;
  const currentlyDue = Array.isArray(requirements?.currently_due)
    ? requirements.currently_due
    : [];

  if (disabledReason) {
    return "restricted";
  }

  if (!account?.details_submitted) {
    return "unverified";
  }

  if (account?.charges_enabled && account?.payouts_enabled && currentlyDue.length === 0) {
    return "verified";
  }

  if (currentlyDue.length > 0) {
    return "review_required";
  }

  return "pending";
}

function isStripeOnboardingComplete(account: any) {
  return Boolean(account?.details_submitted);
}

async function getStripeIdentitySnapshot(
  profile: SellerProfileIdentitySeed
): Promise<StripeIdentitySnapshot> {
  if (isRelayTestModeEnabled() && isRelayTestSellerEmail(profile.email)) {
    return {
      stripeAccountId: profile.stripe_account_id || "acct_test_relay_founder",
      onboardingComplete: true,
      verificationStatus: "verified",
      legalName: profile.full_name || profile.display_name || "Relay Test Seller",
      dob: "1990-01-01",
      countryCode: "US",
      bankFingerprint: "relay-test-bank-fingerprint",
      bankLast4: "0000",
      phone: "5550000000",
      email: profile.email || null,
      rawStatusReason: "relay_test_mode",
    };
  }

  if (!profile.stripe_account_id) {
    return {
      stripeAccountId: null,
      onboardingComplete: false,
      verificationStatus: "unverified",
      legalName: null,
      dob: null,
      countryCode: profile.ship_from_address?.country || null,
      bankFingerprint: null,
      bankLast4: null,
      phone: null,
      email: profile.email || null,
      rawStatusReason: "missing_stripe_account",
    };
  }

  const account = (await stripe.accounts.retrieve(profile.stripe_account_id)) as any;
  const individual = account?.individual || null;
  const company = account?.company || null;
  const bankAccount =
    Array.isArray(account?.external_accounts?.data) &&
    account.external_accounts.data.length > 0
      ? account.external_accounts.data.find((entry: any) => entry?.object === "bank_account") ||
        account.external_accounts.data[0]
      : null;

  const dobYear = individual?.dob?.year ? String(individual.dob.year).padStart(4, "0") : "";
  const dobMonth = individual?.dob?.month ? String(individual.dob.month).padStart(2, "0") : "";
  const dobDay = individual?.dob?.day ? String(individual.dob.day).padStart(2, "0") : "";
  const dob = dobYear && dobMonth && dobDay ? `${dobYear}-${dobMonth}-${dobDay}` : null;
  const legalName =
    [individual?.first_name, individual?.last_name].filter(Boolean).join(" ").trim() ||
    company?.name ||
    account?.business_profile?.name ||
    profile.full_name ||
    profile.display_name ||
    null;

  return {
    stripeAccountId: account.id || profile.stripe_account_id,
    onboardingComplete: isStripeOnboardingComplete(account),
    verificationStatus: deriveVerificationStatus(account),
    legalName: legalName || null,
    dob,
    countryCode: account?.country || profile.ship_from_address?.country || null,
    bankFingerprint: bankAccount?.fingerprint || null,
    bankLast4: bankAccount?.last4 || null,
    phone: individual?.phone || company?.phone || null,
    email: account?.email || profile.email || null,
    rawStatusReason:
      account?.requirements?.disabled_reason ||
      account?.future_requirements?.disabled_reason ||
      null,
  };
}

async function getSellerProfileSeed(
  adminClient: SupabaseAdminClient,
  sellerId: string
) {
  const { data, error } = await adminClient
    .from("profiles")
    .select(`
      id,
      email,
      full_name,
      display_name,
      username,
      role,
      stripe_account_id,
      stripe_connect_onboarding_complete,
      stripe_identity_verification_status,
      seller_identity_review_required,
      seller_identity_review_reason,
      is_banned,
      ban_reason,
      ship_from_address,
      is_founding_seller
    `)
    .eq("id", sellerId)
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Seller profile not found");
  }

  return data as SellerProfileIdentitySeed;
}

async function getExistingIdentityProfile(
  adminClient: SupabaseAdminClient,
  sellerId: string
) {
  const { data, error } = await adminClient
    .from("seller_identity_profiles")
    .select("*")
    .eq("seller_id", sellerId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Failed to load seller identity profile");
  }

  return (data || null) as SellerIdentityProfileRow | null;
}

async function findIdentityMatches(
  adminClient: SupabaseAdminClient,
  input: {
    sellerId: string;
    identityFingerprint: string | null;
    phoneFingerprint: string | null;
    emailFingerprint: string | null;
    bankAccountFingerprint: string | null;
    stripeAccountId: string | null;
  }
) {
  const { data, error } = await adminClient
    .from("seller_identity_profiles")
    .select("*")
    .eq("banned_identity", true)
    .neq("seller_id", input.sellerId);

  if (error) {
    throw new Error(error.message || "Failed to load banned identity fingerprints");
  }

  const matches: IdentityMatchRecord[] = [];

  for (const row of (data || []) as SellerIdentityProfileRow[]) {
    const reasons: string[] = [];

    if (input.identityFingerprint && row.identity_fingerprint === input.identityFingerprint) {
      reasons.push("identity_fingerprint");
    }
    if (input.bankAccountFingerprint && row.bank_account_fingerprint === input.bankAccountFingerprint) {
      reasons.push("bank_account_fingerprint");
    }
    if (input.phoneFingerprint && row.phone_fingerprint === input.phoneFingerprint) {
      reasons.push("phone_fingerprint");
    }
    if (input.emailFingerprint && row.email_fingerprint === input.emailFingerprint) {
      reasons.push("email_fingerprint");
    }
    if (input.stripeAccountId && row.stripe_account_id === input.stripeAccountId) {
      reasons.push("stripe_account_id");
    }

    if (reasons.length > 0) {
      matches.push({
        id: row.id,
        seller_id: row.seller_id,
        reasons,
        banned_reason: row.banned_reason,
      });
    }
  }

  return matches;
}

function buildMatchReasonText(matches: IdentityMatchRecord[]) {
  if (matches.length === 0) {
    return null;
  }

  const uniqueReasons = Array.from(
    new Set(matches.flatMap((match) => match.reasons))
  ).map((reason) => reason.replaceAll("_", " "));

  return `Potential banned identity match via ${uniqueReasons.join(", ")}.`;
}

export async function syncSellerIdentityProfile(
  sellerId: string,
  options?: {
    adminClient?: SupabaseAdminClient;
    actorUserId?: string | null;
    actorRole?: AuditActorRole;
  }
): Promise<SellerIdentitySyncResult> {
  const adminClient = getAdminClient(options?.adminClient);
  const profile = await getSellerProfileSeed(adminClient, sellerId);
  const existingIdentityProfile = await getExistingIdentityProfile(adminClient, sellerId);
  const stripeSnapshot = await getStripeIdentitySnapshot(profile);

  const phoneFingerprint = hashPhoneFingerprint(stripeSnapshot.phone);
  const emailFingerprint = hashFingerprint("email", stripeSnapshot.email);
  const bankAccountFingerprint = hashFingerprint(
    "bank_account",
    stripeSnapshot.bankFingerprint || stripeSnapshot.bankLast4
  );
  const identityFingerprint = buildIdentityFingerprint({
    legalName: stripeSnapshot.legalName,
    dob: stripeSnapshot.dob,
    countryCode: stripeSnapshot.countryCode,
    bankFingerprint: stripeSnapshot.bankFingerprint,
    bankLast4: stripeSnapshot.bankLast4,
    email: stripeSnapshot.email,
    stripeAccountId: stripeSnapshot.stripeAccountId,
  });

  const matches = await findIdentityMatches(adminClient, {
    sellerId,
    identityFingerprint,
    phoneFingerprint,
    emailFingerprint,
    bankAccountFingerprint,
    stripeAccountId: stripeSnapshot.stripeAccountId,
  });

  const matchReasons = Array.from(new Set(matches.flatMap((match) => match.reasons)));
  const bannedIdentityMatch = matches.length > 0;
  const keepFalsePositiveCleared = Boolean(existingIdentityProfile?.false_positive_cleared);
  const verificationRequiresReview = stripeSnapshot.verificationStatus === "restricted";
  const adminReviewRequired =
    (bannedIdentityMatch && !keepFalsePositiveCleared) || verificationRequiresReview;
  const matchedBannedIdentityId = matches[0]?.id || null;
  const reviewReason =
    buildMatchReasonText(matches) ||
    (verificationRequiresReview
      ? "Stripe verification status requires manual Relay review."
      : null);

  const identityUpsertPayload = {
    seller_id: sellerId,
    identity_fingerprint: identityFingerprint,
    phone_fingerprint: phoneFingerprint,
    email_fingerprint: emailFingerprint,
    bank_account_fingerprint: bankAccountFingerprint,
    country_code: stripeSnapshot.countryCode,
    stripe_account_id: stripeSnapshot.stripeAccountId,
    verification_status: adminReviewRequired && stripeSnapshot.verificationStatus === "verified"
      ? "review_required"
      : stripeSnapshot.verificationStatus,
    stripe_connect_onboarding_complete: stripeSnapshot.onboardingComplete,
    matched_banned_identity: bannedIdentityMatch,
    matched_banned_identity_id: matchedBannedIdentityId,
    match_reasons: matchReasons,
    admin_review_required: adminReviewRequired,
    false_positive_cleared: keepFalsePositiveCleared,
  };

  const { data: identityProfile, error: upsertError } = await adminClient
    .from("seller_identity_profiles")
    .upsert(identityUpsertPayload, { onConflict: "seller_id" })
    .select("*")
    .single();

  if (upsertError || !identityProfile) {
    throw new Error(upsertError?.message || "Failed to upsert seller identity profile");
  }

  const { error: profileUpdateError } = await adminClient
    .from("profiles")
    .update({
      stripe_account_id: stripeSnapshot.stripeAccountId,
      stripe_connect_onboarding_complete: stripeSnapshot.onboardingComplete,
      stripe_identity_verification_status: identityUpsertPayload.verification_status,
      seller_identity_review_required: adminReviewRequired,
      seller_identity_review_reason: reviewReason,
    })
    .eq("id", sellerId);

  if (profileUpdateError) {
    throw new Error(profileUpdateError.message || "Failed to sync profile identity flags");
  }

  if (bannedIdentityMatch) {
    await logRelayAuditEvent(adminClient, {
      actorUserId: options?.actorUserId || null,
      actorRole: options?.actorRole || "system",
      sellerId,
      eventType: "seller.identity_match_detected",
      metadata: {
        matchedBannedIdentityId,
        matchReasons,
      },
    });
  }

  return {
    identityProfile: {
      ...(identityProfile as SellerIdentityProfileRow),
      match_reasons: Array.isArray((identityProfile as any).match_reasons)
        ? (identityProfile as any).match_reasons
        : [],
    },
    onboardingComplete: stripeSnapshot.onboardingComplete,
    verificationStatus: identityUpsertPayload.verification_status,
    adminReviewRequired,
    bannedIdentityMatch,
    matchReasons,
  };
}

export async function enforceSellerApprovalIdentityRequirements(
  sellerId: string,
  options?: {
    adminClient?: SupabaseAdminClient;
    actorUserId?: string | null;
    actorRole?: AuditActorRole;
  }
) {
  const adminClient = getAdminClient(options?.adminClient);
  const profile = await getSellerProfileSeed(adminClient, sellerId);
  const syncResult = await syncSellerIdentityProfile(sellerId, {
    ...options,
    adminClient,
  });
  const foundingSellerBypass = Boolean(profile.is_founding_seller);

  if (!syncResult.onboardingComplete) {
    throw new Error("Seller must complete Stripe Connect onboarding before approval.");
  }

  if (profile.is_banned) {
    throw new Error("Seller activation blocked: this seller account is banned.");
  }

  if (syncResult.adminReviewRequired && !foundingSellerBypass) {
    throw new Error(
      syncResult.bannedIdentityMatch
        ? "Seller activation blocked: this identity matches a banned seller fingerprint and needs manual review."
        : "Seller activation blocked: Stripe identity data requires manual review."
    );
  }

  if (syncResult.adminReviewRequired && foundingSellerBypass) {
    await logRelayAuditEvent(adminClient, {
      actorUserId: options?.actorUserId || null,
      actorRole: options?.actorRole || "admin",
      sellerId,
      eventType: "seller.identity_review_bypassed_for_founding",
      metadata: {
        bannedIdentityMatch: syncResult.bannedIdentityMatch,
        matchReasons: syncResult.matchReasons,
      },
    });
  }

  return syncResult;
}

export async function banSellerIdentity(
  sellerId: string,
  input: {
    reason: string;
    adminClient?: SupabaseAdminClient;
    actorUserId?: string | null;
    actorRole?: AuditActorRole;
  }
) {
  const adminClient = getAdminClient(input.adminClient);
  const syncResult = await syncSellerIdentityProfile(sellerId, {
    adminClient,
    actorUserId: input.actorUserId,
    actorRole: input.actorRole,
  });

  const { data: updatedIdentity, error: identityError } = await adminClient
    .from("seller_identity_profiles")
    .update({
      banned_identity: true,
      banned_reason: input.reason,
      admin_review_required: false,
      false_positive_cleared: false,
    })
    .eq("seller_id", sellerId)
    .select("*")
    .single();

  if (identityError || !updatedIdentity) {
    throw new Error(identityError?.message || "Failed to ban seller identity");
  }

  await adminClient
    .from("profiles")
    .update({
      is_banned: true,
      ban_reason: input.reason,
    })
    .eq("id", sellerId);

  await logRelayAuditEvent(adminClient, {
    actorUserId: input.actorUserId || null,
    actorRole: input.actorRole || "admin",
    sellerId,
    eventType: "seller.identity_banned",
    metadata: {
      reason: input.reason,
      identityProfileId: updatedIdentity.id,
      onboardingComplete: syncResult.onboardingComplete,
    },
  });

  return updatedIdentity as SellerIdentityProfileRow;
}

export async function clearSellerIdentityFalsePositive(
  sellerId: string,
  input: {
    adminClient?: SupabaseAdminClient;
    actorUserId?: string | null;
    actorRole?: AuditActorRole;
  }
) {
  const adminClient = getAdminClient(input.adminClient);
  const nowIso = new Date().toISOString();

  const { data: updatedIdentity, error: identityError } = await adminClient
    .from("seller_identity_profiles")
    .update({
      admin_review_required: false,
      false_positive_cleared: true,
      false_positive_cleared_at: nowIso,
      false_positive_cleared_by_admin_id: input.actorUserId || null,
    })
    .eq("seller_id", sellerId)
    .select("*")
    .single();

  if (identityError || !updatedIdentity) {
    throw new Error(identityError?.message || "Failed to clear seller identity false positive");
  }

  await adminClient
    .from("profiles")
    .update({
      seller_identity_review_required: false,
      seller_identity_review_reason: null,
    })
    .eq("id", sellerId);

  await logRelayAuditEvent(adminClient, {
    actorUserId: input.actorUserId || null,
    actorRole: input.actorRole || "admin",
    sellerId,
    eventType: "seller.identity_false_positive_cleared",
    metadata: {
      identityProfileId: updatedIdentity.id,
    },
  });

  return updatedIdentity as SellerIdentityProfileRow;
}

export async function getSellerIdentityProfile(
  sellerId: string,
  adminClient?: SupabaseAdminClient
) {
  return getExistingIdentityProfile(getAdminClient(adminClient), sellerId);
}
