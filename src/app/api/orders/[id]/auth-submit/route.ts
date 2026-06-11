import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { bindRelayTagToOrder } from '@/lib/relay-tags'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orderId } = await params
    const {
      authPhotos,
      checkcheckCertificateUrl,
      challengeCode,
      relayTagScanValue,
      relayTagBarcodeValue,
      sellerTagPhotoUrl,
      sellerPairPhotoUrl,
      sellerBoxPhotoUrl,
      sellerSealedPackagePhotoUrl,
    } = await request.json()

    // Validate inputs
    if (!authPhotos || !Array.isArray(authPhotos) || authPhotos.length < 8) {
      return NextResponse.json(
        { error: 'At least 8 authentication photos are required' },
        { status: 400 }
      )
    }

    // Determine authentication method:
    // 1. Challenge code (mobile flow — no login required)
    // 2. Logged-in user session (desktop fallback)
    let isAuthorized = false

    if (challengeCode) {
      // Mobile flow: verify via challenge code
      const serviceClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )

      const { data: order, error: orderError } = await serviceClient
        .from('orders')
        .select('id, seller_id, challenge_code, status, relay_tag_required, checkcheck_required')
        .eq('id', orderId)
        .single()

      if (orderError || !order) {
        return NextResponse.json({ error: 'Order not found' }, { status: 404 })
      }

      if (order.status !== 'paid') {
        return NextResponse.json(
          { error: 'Order must be in paid status to submit authentication' },
          { status: 400 }
        )
      }

      if (order.challenge_code?.toUpperCase() !== challengeCode?.toUpperCase()) {
        return NextResponse.json({ error: 'Invalid challenge code' }, { status: 403 })
      }

      isAuthorized = true

      if (order.relay_tag_required) {
        if (
          !relayTagScanValue ||
          !sellerTagPhotoUrl ||
          !sellerPairPhotoUrl ||
          !sellerBoxPhotoUrl ||
          !sellerSealedPackagePhotoUrl
        ) {
          return NextResponse.json(
            { error: 'Relay tag serial and all required seller custody photos are required' },
            { status: 400 }
          )
        }

        await bindRelayTagToOrder(serviceClient as any, {
          orderId,
          sellerId: order.seller_id,
          actorRole: 'seller',
          scannedValue: relayTagScanValue,
          scannedBarcodeValue: relayTagBarcodeValue || null,
          sellerTagPhotoUrl,
          sellerPairPhotoUrl,
          sellerBoxPhotoUrl,
          sellerSealedPackagePhotoUrl,
        })
      }

      if (order.checkcheck_required && !checkcheckCertificateUrl) {
        return NextResponse.json(
          { error: 'CheckCheck certificate URL is required' },
          { status: 400 }
        )
      }

      // Update using service role client
      const { data: updatedOrder, error: updateError } = await serviceClient
        .from('orders')
        .update({
          auth_photos: authPhotos,
          checkcheck_certificate_url: checkcheckCertificateUrl || null,
          checkcheck_status: order.checkcheck_required ? 'submitted' : 'not_required',
          status: 'auth_submitted',
        })
        .eq('id', orderId)
        .select()
        .single()

      if (updateError) {
        console.error('Auth submit error:', updateError)
        return NextResponse.json(
          { error: 'Failed to submit authentication' },
          { status: 500 }
        )
      }

      return NextResponse.json(updatedOrder)
    } else {
      // Session-based flow: verify user is the seller
      const cookieStore = await cookies()
      const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookies: {
            getAll() {
              return cookieStore.getAll()
            },
            setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
              try {
                cookiesToSet.forEach(({ name, value, options }) =>
                  cookieStore.set(name, value, options)
                )
              } catch {
                // Handle SSR context
              }
            },
          },
        }
      )

      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      const { data: order, error: orderError } = await supabase
        .from('orders')
        .select('id, seller_id, status, relay_tag_required, checkcheck_required')
        .eq('id', orderId)
        .single()

      if (orderError || !order) {
        return NextResponse.json({ error: 'Order not found' }, { status: 404 })
      }

      if (order.seller_id !== user.id) {
        return NextResponse.json(
          { error: 'Only the seller can submit authentication' },
          { status: 403 }
        )
      }

      if (order.status !== 'paid') {
        return NextResponse.json(
          { error: 'Order must be in paid status to submit authentication' },
          { status: 400 }
        )
      }

      if (order.relay_tag_required) {
        if (
          !relayTagScanValue ||
          !sellerTagPhotoUrl ||
          !sellerPairPhotoUrl ||
          !sellerBoxPhotoUrl ||
          !sellerSealedPackagePhotoUrl
        ) {
          return NextResponse.json(
            { error: 'Relay tag serial and all required seller custody photos are required' },
            { status: 400 }
          )
        }

        await bindRelayTagToOrder(createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        ) as any, {
          orderId,
          sellerId: order.seller_id,
          actorUserId: user.id,
          actorRole: 'seller',
          scannedValue: relayTagScanValue,
          scannedBarcodeValue: relayTagBarcodeValue || null,
          sellerTagPhotoUrl,
          sellerPairPhotoUrl,
          sellerBoxPhotoUrl,
          sellerSealedPackagePhotoUrl,
        })
      }

      if (order.checkcheck_required && !checkcheckCertificateUrl) {
        return NextResponse.json(
          { error: 'CheckCheck certificate URL is required' },
          { status: 400 }
        )
      }

      const { data: updatedOrder, error: updateError } = await supabase
        .from('orders')
        .update({
          auth_photos: authPhotos,
          checkcheck_certificate_url: checkcheckCertificateUrl || null,
          checkcheck_status: order.checkcheck_required ? 'submitted' : 'not_required',
          status: 'auth_submitted',
        })
        .eq('id', orderId)
        .select()
        .single()

      if (updateError) {
        console.error('Auth submit error:', updateError)
        return NextResponse.json(
          { error: 'Failed to submit authentication' },
          { status: 500 }
        )
      }

      return NextResponse.json(updatedOrder)
    }
  } catch (error) {
    console.error('Auth submission error:', error)
    return NextResponse.json(
      { error: 'Failed to submit authentication' },
      { status: 500 }
    )
  }
}
