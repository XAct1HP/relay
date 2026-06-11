import { NextResponse } from "next/server";
import { createServerClientInstance } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { resolveSignedMediaList, resolveSignedMediaValue } from "@/lib/secure-storage";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orderId } = await params;
    const supabase = await createServerClientInstance();
    const adminClient = createAdminClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, role")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const { data: order, error } = await adminClient
      .from("orders")
      .select(`
        *,
        listings(*),
        buyer:profiles!orders_buyer_id_fkey(*),
        seller:profiles!orders_seller_id_fkey(*),
        order_chain_of_custody(*),
        relay_tag:relay_tags!orders_relay_tag_id_fkey(
          id,
          tag_serial_number,
          barcode_value,
          status
        ),
        order_disputes(*)
      `)
      .eq("id", orderId)
      .single();

    if (error || !order) {
      return NextResponse.json({ error: error?.message || "Order not found" }, { status: 404 });
    }

    const isParticipant = order.buyer_id === user.id || order.seller_id === user.id;
    const isAdmin = profile.role === "admin";
    if (!isParticipant && !isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const custodyRows = Array.isArray(order.order_chain_of_custody)
      ? order.order_chain_of_custody
      : order.order_chain_of_custody
        ? [order.order_chain_of_custody]
        : [];

    const signedCustodyRows = await Promise.all(
      custodyRows.map(async (row: any) => ({
        ...row,
        seller_tag_photo_url: await resolveSignedMediaValue(adminClient, row.seller_tag_photo_url),
        seller_pair_photo_url: await resolveSignedMediaValue(adminClient, row.seller_pair_photo_url),
        seller_box_photo_url: await resolveSignedMediaValue(adminClient, row.seller_box_photo_url),
        seller_sealed_package_photo_url: await resolveSignedMediaValue(adminClient, row.seller_sealed_package_photo_url),
        buyer_tag_photo_url: await resolveSignedMediaValue(adminClient, row.buyer_tag_photo_url),
        buyer_pair_photo_url: await resolveSignedMediaValue(adminClient, row.buyer_pair_photo_url),
      }))
    );

    const disputeRows = Array.isArray(order.order_disputes)
      ? order.order_disputes
      : order.order_disputes
        ? [order.order_disputes]
        : [];

    const signedDisputeRows = await Promise.all(
      disputeRows.map(async (row: any) => ({
        ...row,
        evidence_urls: await resolveSignedMediaList(adminClient, row.evidence_urls),
        buyer_evidence_urls: await resolveSignedMediaList(adminClient, row.buyer_evidence_urls),
        seller_evidence_urls: await resolveSignedMediaList(adminClient, row.seller_evidence_urls),
      }))
    );

    return NextResponse.json({
      ...order,
      auth_photos: await resolveSignedMediaList(adminClient, order.auth_photos),
      checkcheck_certificate_url: await resolveSignedMediaValue(adminClient, order.checkcheck_certificate_url),
      dispute_evidence_buyer: await resolveSignedMediaList(adminClient, order.dispute_evidence_buyer),
      dispute_evidence_seller: await resolveSignedMediaList(adminClient, order.dispute_evidence_seller),
      order_chain_of_custody: signedCustodyRows,
      order_disputes: signedDisputeRows,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load order" },
      { status: 500 }
    );
  }
}
