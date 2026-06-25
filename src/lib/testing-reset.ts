import "server-only";

type SupabaseAdminClient = ReturnType<typeof import("@/lib/supabase-admin").createAdminClient>;

const RESET_CONFIRMATION = "RESET STAGING";

const RESET_TABLES_IN_ORDER: string[] = [
  "conversation_reads",
  "messages",
  "custom_offers",
  "conversations",
  "follows",
  "post_likes",
  "posts",
  "reviews",
  "order_disputes",
  "order_chain_of_custody",
  "order_payouts",
  "seller_reserve_entries",
  "exposure_holds",
  "relay_tag_scan_events",
  "withdrawal_requests",
  "relay_balance_ledger",
  "relay_balances",
  "seller_reserve_accounts",
  "orders",
  "tag_orders",
  "seller_tag_requests",
  "relay_tags",
  "seller_tier_history",
  "seller_trust_evaluations",
  "seller_violations",
  "seller_identity_profiles",
  "seller_api_keys",
  "integration_api_logs",
  "seller_applications",
  "listing_used_items",
  "listing_variants",
  "listings",
];

interface ResetTableResult {
  table: string;
  status: "deleted" | "skipped_missing";
}

export interface TestingResetResult {
  environment: string;
  deletedAuthUserCount: number;
  deletedProfileCount: number;
  preservedAdminCount: number;
  tableResults: ResetTableResult[];
}

export function getTestingResetConfirmationText() {
  return RESET_CONFIRMATION;
}

export function isTestingResetAllowed() {
  const vercelEnv = process.env.VERCEL_ENV || "";
  const nodeEnv = process.env.NODE_ENV || "";
  const relayTestMode = process.env.RELAY_TEST_MODE || "";

  if (vercelEnv === "production") {
    return false;
  }

  return (
    vercelEnv === "preview" ||
    nodeEnv === "development" ||
    relayTestMode === "true"
  );
}

export function getTestingResetEnvironmentLabel() {
  if (process.env.VERCEL_ENV) {
    return `vercel:${process.env.VERCEL_ENV}`;
  }

  return process.env.NODE_ENV || "unknown";
}

function isMissingTableError(error: unknown) {
  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : "";

  return (
    message.includes("Could not find the table") ||
    message.includes("relation") && message.includes("does not exist")
  );
}

async function deleteAllRows(
  adminClient: SupabaseAdminClient,
  table: string
): Promise<ResetTableResult> {
  const { error } = await adminClient.from(table).delete();

  if (error) {
    if (isMissingTableError(error.message || error)) {
      return {
        table,
        status: "skipped_missing",
      };
    }

    throw new Error(`Failed to clear ${table}: ${error.message}`);
  }

  return {
    table,
    status: "deleted",
  };
}

export async function resetTestingMarketplaceData(
  adminClient: SupabaseAdminClient,
  input: {
    actorUserId: string;
    confirmation: string;
  }
): Promise<TestingResetResult> {
  if (!isTestingResetAllowed()) {
    throw new Error(
      "Testing reset is blocked outside preview, development, or explicit test mode."
    );
  }

  if (input.confirmation.trim() !== RESET_CONFIRMATION) {
    throw new Error(`Confirmation text must exactly match "${RESET_CONFIRMATION}".`);
  }

  const { data: profiles, error: profilesError } = await adminClient
    .from("profiles")
    .select("id, role")
    .neq("id", input.actorUserId);

  if (profilesError) {
    throw new Error(profilesError.message || "Failed to load profiles for reset.");
  }

  const nonAdminProfileIds = (profiles || [])
    .filter((profile: any) => profile.role !== "admin")
    .map((profile: any) => String(profile.id));
  const preservedAdminCount = (profiles || []).filter(
    (profile: any) => profile.role === "admin"
  ).length + 1;

  const tableResults: ResetTableResult[] = [];

  for (const table of RESET_TABLES_IN_ORDER) {
    tableResults.push(await deleteAllRows(adminClient, table));
  }

  let deletedProfileCount = 0;
  if (nonAdminProfileIds.length > 0) {
    const { error: profileDeleteError } = await adminClient
      .from("profiles")
      .delete()
      .in("id", nonAdminProfileIds);

    if (profileDeleteError) {
      throw new Error(
        profileDeleteError.message || "Failed to delete non-admin profiles during reset."
      );
    }

    deletedProfileCount = nonAdminProfileIds.length;
  }

  let deletedAuthUserCount = 0;
  for (const userId of nonAdminProfileIds) {
    const { error } = await adminClient.auth.admin.deleteUser(userId);

    if (error) {
      throw new Error(`Failed to delete auth user ${userId}: ${error.message}`);
    }

    deletedAuthUserCount += 1;
  }

  return {
    environment: getTestingResetEnvironmentLabel(),
    deletedAuthUserCount,
    deletedProfileCount,
    preservedAdminCount,
    tableResults,
  };
}
