import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export interface IntegrationApiLogInput {
  sellerId?: string | null;
  apiKeyId?: string | null;
  endpoint: string;
  method: string;
  statusCode: number;
  requestId: string;
  errorCode?: string | null;
}

export async function logIntegrationApiRequest(
  supabase: SupabaseClient,
  input: IntegrationApiLogInput
): Promise<void> {
  const endpoint = String(input.endpoint || "").trim();
  const method = String(input.method || "").trim().toUpperCase();
  const requestId = String(input.requestId || "").trim();

  if (!endpoint || !method || !requestId) {
    return;
  }

  const { error } = await supabase.from("integration_api_logs").insert({
    seller_id: input.sellerId?.trim() || null,
    api_key_id: input.apiKeyId?.trim() || null,
    endpoint,
    method,
    status_code: Number(input.statusCode) || 500,
    request_id: requestId,
    error_code: input.errorCode?.trim() || null,
  });

  if (error) {
    console.error("Integration API log insert failed:", error);
  }
}
