import "server-only";

import { generateChallengeCode } from "@/lib/utils";

type SupabaseAdminClient = ReturnType<
  typeof import("@/lib/supabase-admin").createAdminClient
>;

const BUYER_REVIEW_STATUSES = new Set(["delivered", "review_window", "disputed"]);

export async function ensureBuyerChallengeCode(
  adminClient: SupabaseAdminClient,
  input: {
    orderId: string;
    currentCode?: string | null;
    status?: string | null;
    relayTagRequired?: boolean | null;
    authRequirementsEvaluatedAt?: string | null;
  }
) {
  if (input.currentCode) {
    return input.currentCode;
  }

  if (
    !input.orderId ||
    !input.relayTagRequired ||
    !input.authRequirementsEvaluatedAt ||
    !BUYER_REVIEW_STATUSES.has(String(input.status || ""))
  ) {
    return null;
  }

  const nextCode = generateChallengeCode();
  const { data, error } = await adminClient
    .from("orders")
    .update({
      buyer_challenge_code: nextCode,
    })
    .eq("id", input.orderId)
    .is("buyer_challenge_code", null)
    .select("buyer_challenge_code")
    .single();

  if (error) {
    const { data: existing } = await adminClient
      .from("orders")
      .select("buyer_challenge_code")
      .eq("id", input.orderId)
      .single();

    return existing?.buyer_challenge_code || null;
  }

  return data?.buyer_challenge_code || nextCode;
}
