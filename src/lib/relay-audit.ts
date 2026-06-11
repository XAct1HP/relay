import "server-only";

import type { AuditActorRole } from "@/types/trust";

export interface RelayAuditEventInput {
  actorUserId?: string | null;
  actorRole: AuditActorRole;
  eventType: string;
  orderId?: string | null;
  sellerId?: string | null;
  metadata?: Record<string, unknown>;
}

export async function logRelayAuditEvent(
  client: any,
  input: RelayAuditEventInput
) {
  const { error } = await client.from("relay_audit_events").insert({
    actor_user_id: input.actorUserId || null,
    actor_role: input.actorRole,
    event_type: input.eventType,
    order_id: input.orderId || null,
    seller_id: input.sellerId || null,
    metadata: input.metadata || {},
  });

  if (error) {
    console.error("Failed to log relay audit event:", error);
  }
}
