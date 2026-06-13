import { NextResponse } from "next/server"
import { createServerClientInstance } from "@/lib/supabase-server"
import { createAdminClient } from "@/lib/supabase-admin"
import { resolveSignedMediaValue } from "@/lib/secure-storage"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orderId } = await params
    const supabase = await createServerClientInstance()
    const adminClient = createAdminClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: order, error } = await adminClient
      .from("orders")
      .select(`
        id,
        status,
        buyer_id,
        relay_tag_required,
        auth_requirements_evaluated_at,
        listings(brand, model),
        order_chain_of_custody(
          buyer_scanned_tag_value,
          buyer_tag_photo_url,
          buyer_pair_photo_url
        ),
        relay_tag:relay_tags!orders_relay_tag_id_fkey(
          tag_serial_number
        )
      `)
      .eq("id", orderId)
      .single()

    if (error || !order) {
      return NextResponse.json({ error: error?.message || "Order not found" }, { status: 404 })
    }

    if (order.buyer_id !== user.id) {
      return NextResponse.json({ error: "Only the buyer can access this review flow" }, { status: 403 })
    }

    const custody = Array.isArray(order.order_chain_of_custody)
      ? order.order_chain_of_custody[0]
      : order.order_chain_of_custody
    const relayTag = Array.isArray((order as any).relay_tag)
      ? (order as any).relay_tag[0]
      : (order as any).relay_tag

    return NextResponse.json({
      id: order.id,
      status: order.status,
      relayTagRequired: Boolean(order.relay_tag_required),
      legacyAuthFlow: !order.auth_requirements_evaluated_at,
      expectedRelayTagValue: relayTag?.tag_serial_number || null,
      buyerScannedTagValue: custody?.buyer_scanned_tag_value || null,
      buyerTagPhotoUrl: await resolveSignedMediaValue(adminClient, custody?.buyer_tag_photo_url),
      buyerPairPhotoUrl: await resolveSignedMediaValue(adminClient, custody?.buyer_pair_photo_url),
      brand: (order as any).listings?.brand || "Unknown",
      model: (order as any).listings?.model || "Pair",
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load buyer review context" },
      { status: 500 }
    )
  }
}
