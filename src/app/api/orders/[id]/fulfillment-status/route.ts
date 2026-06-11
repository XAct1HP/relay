import { NextResponse } from "next/server";
import { createServerClientInstance } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getOrderFulfillmentGateStatus } from "@/lib/order-auth";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orderId } = await params;
    const supabase = await createServerClientInstance();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: order, error } = await supabase
      .from("orders")
      .select("id, buyer_id, seller_id")
      .eq("id", orderId)
      .single();

    if (error || !order) {
      return NextResponse.json({ error: error?.message || "Order not found" }, { status: 404 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const isParticipant = order.buyer_id === user.id || order.seller_id === user.id;
    const isAdmin = profile?.role === "admin";
    if (!isParticipant && !isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const status = await getOrderFulfillmentGateStatus(createAdminClient(), orderId);
    return NextResponse.json(status);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load fulfillment status" },
      { status: 500 }
    );
  }
}
