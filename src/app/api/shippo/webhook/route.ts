import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { handleShippoTrackingWebhookEvent } from "@/lib/background-jobs";

function normalizeTrackingStatus(value: unknown) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

function parseShippoWebhookPayload(event: any) {
  const shippoTrackingNumber =
    typeof event?.data?.tracking_number === "string"
      ? event.data.tracking_number.trim()
      : "";
  const shippoTrackingStatus = normalizeTrackingStatus(
    event?.data?.tracking_status?.status || event?.data?.status
  );

  if (event?.event === "track_updated" && shippoTrackingNumber && shippoTrackingStatus) {
    return {
      trackingNumber: shippoTrackingNumber,
      trackingStatus: shippoTrackingStatus,
      source: "shippo_track_updated",
    };
  }

  const testTrackingNumber =
    typeof event?.trackingNumber === "string"
      ? event.trackingNumber.trim()
      : typeof event?.tracking_number === "string"
        ? event.tracking_number.trim()
        : "";
  const testTrackingStatus = normalizeTrackingStatus(
    event?.trackingStatus || event?.tracking_status || event?.status
  );
  const isTestPayload =
    event?.test === true ||
    event?.test_mode === true ||
    event?.source === "relay_test_shippo" ||
    event?.event === "relay_test_track_updated";

  if (isTestPayload && testTrackingNumber && testTrackingStatus) {
    return {
      trackingNumber: testTrackingNumber,
      trackingStatus: testTrackingStatus,
      source: "relay_test_shippo",
    };
  }

  return null;
}

export async function POST(request: NextRequest) {
  try {
    const event = await request.json();
    const parsedPayload = parseShippoWebhookPayload(event);

    if (!parsedPayload) {
      return NextResponse.json({
        received: true,
        handled: false,
        reason: "unsupported_shippo_payload",
        routePath: "/api/shippo/webhook",
      });
    }

    const result = await handleShippoTrackingWebhookEvent(createAdminClient(), {
      trackingNumber: parsedPayload.trackingNumber,
      trackingStatus: parsedPayload.trackingStatus,
      rawEvent: event,
    });

    return NextResponse.json({
      received: true,
      handled: true,
      routePath: "/api/shippo/webhook",
      source: parsedPayload.source,
      result,
    });
  } catch (error) {
    console.error("Shippo webhook error:", error);
    return NextResponse.json({
      received: true,
      handled: false,
      routePath: "/api/shippo/webhook",
      error: error instanceof Error ? error.message : "Shippo webhook error",
    });
  }
}
