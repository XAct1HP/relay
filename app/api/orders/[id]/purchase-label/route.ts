import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { buyShippoLabel } from "@/lib/shippo";

type RouteProps = {
  params: Promise<{ id: string }>;
};

export async function POST(_req: NextRequest, { params }: RouteProps) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .select("id, seller_id, status, shippo_rate_id")
      .eq("id", id)
      .single();

    if (error || !order) {
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }

    if (order.seller_id !== user.id) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    if (order.status !== "paid" && order.status !== "label_created") {
      return NextResponse.json(
        { error: "This order is not ready for label purchase." },
        { status: 400 }
      );
    }

    if (!order.shippo_rate_id) {
      return NextResponse.json(
        { error: "Missing shipping rate for this order." },
        { status: 400 }
      );
    }

    const transaction = await buyShippoLabel({
      rateId: order.shippo_rate_id,
      metadata: JSON.stringify({ orderId: order.id }),
    });

    if (transaction.status !== "SUCCESS") {
      const message =
        transaction.messages?.[0]?.text || "Shippo failed to create the label.";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const trackingStatus =
      transaction.tracking_status?.status?.toLowerCase() || "pre_transit";

    const { error: updateError } = await supabaseAdmin
      .from("orders")
      .update({
        shippo_transaction_id: transaction.object_id,
        tracking_code: transaction.tracking_number ?? null,
        shipping_label_url: transaction.label_url ?? null,
        last_tracking_status: trackingStatus,
        status: "label_created",
      })
      .eq("id", id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      labelUrl: transaction.label_url,
      trackingCode: transaction.tracking_number,
      trackingStatus,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to buy label." },
      { status: 500 }
    );
  }
}