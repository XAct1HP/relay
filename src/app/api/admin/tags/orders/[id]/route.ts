import { createServerClient } from "@supabase/ssr";
import { createRelayTagOrderLabel } from "@/lib/shippo";
import { createAdminClient } from "@/lib/supabase-admin";
import { logRelayAuditEventOnce } from "@/lib/relay-audit";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orderId } = await params;
    const cookieStore = await cookies();
    const adminClient = createAdminClient();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {}
          },
        },
      }
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { status, adminNotes } = body;

    const validStatuses = ["processing", "shipped", "fulfilled"];
    if (!status || !validStatuses.includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const updatePayload: Record<string, unknown> = { status };

    if (status === "shipped") {
      const { data: tagOrder, error: tagOrderError } = await adminClient
        .from("tag_orders")
        .select(
          "id, seller_id, bundle_name, quantity, status, admin_notes, shipped_at, shipping_tracking_number, shipping_carrier, shipping_label_url"
        )
        .eq("id", orderId)
        .single();

      if (tagOrderError || !tagOrder) {
        return NextResponse.json({ error: "Tag order not found" }, { status: 404 });
      }

      if (tagOrder.shipping_label_url && tagOrder.shipping_tracking_number) {
        if (adminNotes !== undefined && adminNotes !== tagOrder.admin_notes) {
          const { error: notesError } = await adminClient
            .from("tag_orders")
            .update({ admin_notes: adminNotes })
            .eq("id", orderId);

          if (notesError) {
            console.error("Tag order notes update error:", notesError);
          }
        }

        return NextResponse.json({
          success: true,
          trackingNumber: tagOrder.shipping_tracking_number,
          carrier: tagOrder.shipping_carrier,
          labelUrl: tagOrder.shipping_label_url,
          reused: true,
        });
      }

      const { data: sellerProfile, error: sellerProfileError } = await adminClient
        .from("profiles")
        .select("id, email, ship_from_address")
        .eq("id", tagOrder.seller_id)
        .single();

      if (sellerProfileError || !sellerProfile) {
        return NextResponse.json({ error: "Seller profile not found" }, { status: 404 });
      }

      const label = await createRelayTagOrderLabel({
        sellerAddress: sellerProfile.ship_from_address,
        sellerEmail: sellerProfile.email,
        quantity: Number(tagOrder.quantity || 0),
      });

      updatePayload.shipped_at = tagOrder.shipped_at || new Date().toISOString();
      updatePayload.shipping_tracking_number = label.trackingNumber;
      updatePayload.shipping_carrier = label.carrier;
      updatePayload.shipping_label_url = label.labelUrl;
      updatePayload.shippo_transaction_id = label.transactionId;
      updatePayload.shippo_shipment_id = label.shipmentId;
      updatePayload.shippo_rate_id = label.rateId;

      const { error: updateError } = await adminClient
        .from("tag_orders")
        .update({
          ...updatePayload,
          ...(adminNotes !== undefined ? { admin_notes: adminNotes } : {}),
        })
        .eq("id", orderId);

      if (updateError) {
        console.error("Tag order update error:", updateError);
        return NextResponse.json(
          { error: "Label created, but Relay could not save the tag shipment details." },
          { status: 500 }
        );
      }

      await logRelayAuditEventOnce(adminClient, {
        actorUserId: user.id,
        actorRole: "admin",
        sellerId: tagOrder.seller_id,
        eventType: "tag_order.shipping_label_generated",
        idempotencyKey: `tag-order-ship:${orderId}`,
        metadata: {
          tagOrderId: orderId,
          bundleName: tagOrder.bundle_name,
          quantity: tagOrder.quantity,
          trackingNumber: label.trackingNumber,
          carrier: label.carrier,
          shippoTransactionId: label.transactionId,
          shippoShipmentId: label.shipmentId,
          shippoRateId: label.rateId,
        },
      });

      return NextResponse.json({
        success: true,
        trackingNumber: label.trackingNumber,
        carrier: label.carrier,
        labelUrl: label.labelUrl,
      });
    }

    if (status === "fulfilled") {
      updatePayload.fulfilled_at = new Date().toISOString();
    }

    if (adminNotes !== undefined) {
      updatePayload.admin_notes = adminNotes;
    }

    const { error: updateError } = await adminClient
      .from("tag_orders")
      .update(updatePayload)
      .eq("id", orderId);

    if (updateError) {
      console.error("Tag order update error:", updateError);
      return NextResponse.json({ error: "Failed to update tag order" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Admin tag order update error:", error);
    return NextResponse.json({ error: "Failed to update tag order" }, { status: 500 });
  }
}
