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

export async function logRelayAuditEventOnce(
  client: any,
  input: RelayAuditEventInput & {
    idempotencyKey: string;
  }
) {
  const idempotencyKey = String(input.idempotencyKey || "").trim();
  if (!idempotencyKey) {
    await logRelayAuditEvent(client, input);
    return { created: true };
  }

  const { data: existingEvent, error: existingEventError } = await client
    .from("relay_audit_events")
    .select("id")
    .eq("event_type", input.eventType)
    .eq("order_id", input.orderId || null)
    .eq("seller_id", input.sellerId || null)
    .contains("metadata", { idempotency_key: idempotencyKey })
    .maybeSingle();

  if (existingEventError) {
    console.error("Failed to inspect relay audit events:", existingEventError);
  }

  if (existingEvent?.id) {
    return { created: false, eventId: existingEvent.id };
  }

  const metadata = {
    ...(input.metadata || {}),
    idempotency_key: idempotencyKey,
  };

  const { data: insertedEvent, error } = await client
    .from("relay_audit_events")
    .insert({
      actor_user_id: input.actorUserId || null,
      actor_role: input.actorRole,
      event_type: input.eventType,
      order_id: input.orderId || null,
      seller_id: input.sellerId || null,
      metadata,
    })
    .select("id")
    .single();

  if (error) {
    const { data: recoveredEvent } = await client
      .from("relay_audit_events")
      .select("id")
      .eq("event_type", input.eventType)
      .eq("order_id", input.orderId || null)
      .eq("seller_id", input.sellerId || null)
      .contains("metadata", { idempotency_key: idempotencyKey })
      .maybeSingle();

    if (recoveredEvent?.id) {
      return { created: false, eventId: recoveredEvent.id };
    }

    console.error("Failed to log relay audit event:", error);
    return { created: false };
  }

  return { created: true, eventId: insertedEvent?.id };
}
