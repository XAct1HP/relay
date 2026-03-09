import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

function normalizeStatus(status?: string | null) {
  const value = (status || "").toLowerCase();

  if (value === "pre_transit" || value === "unknown") return "label_created";
  if (value === "transit" || value === "in_transit") return "shipped";
  if (value === "out_for_delivery") return "out_for_delivery";
  if (value === "delivered") return "delivered";
  if (value === "return_to_sender") return "returned";

  return null;
}

export async function POST(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");

    if (token !== process.env.SHIPPO_WEBHOOK_TOKEN) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const body = await req.json();

    const event = body?.event;
    const data = body?.data;

    if (event !== "track_updated") {
      return NextResponse.json({ received: true });
    }

    const trackingNumber =
      data?.tracking_number ||
      data?.tracking_status?.tracking_number ||
      null;

    const trackingStatus =
      data?.tracking_status?.status ||
      data?.tracking_status?.status_details ||
      data?.status ||
      null;

    if (!trackingNumber) {
      return NextResponse.json({ received: true });
    }

    const relayStatus = normalizeStatus(trackingStatus);

    const payload: Record<string, string> = {
      last_tracking_status: String(trackingStatus || "").toLowerCase(),
    };

    if (relayStatus) {
      payload.status = relayStatus;
    }

    const { error } = await supabaseAdmin
      .from("orders")
      .update(payload)
      .eq("tracking_code", trackingNumber);

    if (error) {
      console.error("Shippo webhook update error:", error);
      return new NextResponse("Database error", { status: 500 });
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Shippo webhook error:", error);
    return new NextResponse("Webhook error", { status: 400 });
  }
}