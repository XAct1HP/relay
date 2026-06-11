import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { handleShippoTrackingWebhookEvent } from "@/lib/background-jobs";

export async function POST(request: NextRequest) {
  try {
    const event = await request.json();
    const trackingNumber = event?.data?.tracking_number;
    const trackingStatus = event?.data?.tracking_status?.status || event?.data?.status;

    if (event?.event === "track_updated" && trackingNumber && trackingStatus) {
      await handleShippoTrackingWebhookEvent(createAdminClient(), {
        trackingNumber,
        trackingStatus,
        rawEvent: event,
      });
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Shippo webhook error:", error);
    return NextResponse.json({ received: true });
  }
}
