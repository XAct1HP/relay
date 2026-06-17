import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { ensureBuyerChallengeCode } from '@/lib/buyer-challenge-code'
import { recordCustodyUpload } from '@/lib/relay-tags'
import { buildStorageObjectRef, createSignedStorageUrl, sanitizeUploadedFileName } from '@/lib/secure-storage'

const MAX_FILE_SIZE = 10 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const ALLOWED_DOCUMENT_TYPES = new Set(['application/pdf'])
const ALLOWED_FILE_NAMES = new Set([
  'front.jpg',
  'back.jpg',
  'medial.jpg',
  'lateral.jpg',
  'sole.jpg',
  'size-tag.jpg',
  'challenge-code.jpg',
  'packed-shipment.jpg',
  'relay-tag.jpg',
  'seller-pair.jpg',
  'seller-box.jpg',
  'sealed-package.jpg',
  'buyer-tag-live.jpg',
  'buyer-pair-live.jpg',
])

/**
 * Public upload endpoint for the mobile auth flow.
 * Authenticates via challenge code instead of user session.
 * Accepts a single file upload and stores it in the order-photos bucket.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orderId } = await params

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const challengeCode = formData.get('challengeCode') as string | null
    const fileName = formData.get('fileName') as string | null

    if (!file || !challengeCode || !fileName) {
      return NextResponse.json(
        { error: 'Missing required fields: file, challengeCode, fileName' },
        { status: 400 }
      )
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 10MB.' },
        { status: 400 }
      )
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Verify challenge code
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, challenge_code, buyer_challenge_code, status, seller_id, buyer_id, relay_tag_required, auth_requirements_evaluated_at')
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    const normalizedFileName = sanitizeUploadedFileName(fileName)
    const normalizedInput = challengeCode?.toUpperCase()
    const isBuyerUpload = ['buyer-tag-live.jpg', 'buyer-pair-live.jpg'].includes(normalizedFileName)
    const buyerChallengeCode = isBuyerUpload
      ? await ensureBuyerChallengeCode(createAdminClient(), {
          orderId,
          currentCode: order.buyer_challenge_code,
          status: order.status,
          relayTagRequired: order.relay_tag_required,
          authRequirementsEvaluatedAt: order.auth_requirements_evaluated_at,
        })
      : null
    const expectedCode = isBuyerUpload
      ? buyerChallengeCode?.toUpperCase()
      : order.challenge_code?.toUpperCase()

    if (!expectedCode || expectedCode !== normalizedInput) {
      return NextResponse.json({ error: 'Invalid challenge code' }, { status: 403 })
    }
    const isCertificate = normalizedFileName.startsWith('checkcheck-certificate.')
    const isAllowedNamedUpload = ALLOWED_FILE_NAMES.has(normalizedFileName)
    const isBuyerCustodyUpload = ['buyer-tag-live.jpg', 'buyer-pair-live.jpg'].includes(normalizedFileName)

    if (!isCertificate && !isAllowedNamedUpload) {
      return NextResponse.json(
        { error: 'Unsupported upload file name' },
        { status: 400 }
      )
    }

    if (isBuyerCustodyUpload) {
      if (!['delivered', 'review_window', 'disputed'].includes(order.status)) {
        return NextResponse.json(
          { error: 'Order is not ready for buyer verification' },
          { status: 400 }
        )
      }
    } else if (order.status !== 'paid' && order.status !== 'auth_submitted') {
      return NextResponse.json(
        { error: 'Order is not awaiting authentication' },
        { status: 400 }
      )
    }

    if (isCertificate) {
      if (!ALLOWED_IMAGE_TYPES.has(file.type) && !ALLOWED_DOCUMENT_TYPES.has(file.type)) {
        return NextResponse.json(
          { error: 'Invalid certificate file type. Only PDF, JPG, PNG, and WebP are allowed.' },
          { status: 400 }
        )
      }
    } else if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Only JPG, PNG, and WebP are allowed.' },
        { status: 400 }
      )
    }

    // Upload file to storage
    const path = isCertificate
      ? `${orderId}/checkcheck/${normalizedFileName}`
      : ALLOWED_FILE_NAMES.has(normalizedFileName) && normalizedFileName.startsWith('buyer-')
        ? `${orderId}/buyer-custody/${normalizedFileName}`
        : ALLOWED_FILE_NAMES.has(normalizedFileName) &&
            ['relay-tag.jpg', 'seller-pair.jpg', 'seller-box.jpg', 'sealed-package.jpg'].includes(normalizedFileName)
          ? `${orderId}/seller-custody/${normalizedFileName}`
          : `${orderId}/auth/${normalizedFileName}`
    const buffer = Buffer.from(await file.arrayBuffer())

    const { error: uploadError } = await supabase.storage
      .from('order-photos')
      .upload(path, buffer, {
        upsert: true,
        contentType: file.type || 'image/jpeg',
      })

    if (uploadError) {
      console.error('Storage upload error:', uploadError)
      return NextResponse.json(
        { error: `Upload failed: ${uploadError.message}` },
        { status: 500 }
      )
    }

    const storageRef = buildStorageObjectRef('order-photos', path)
    const signedUrl = await createSignedStorageUrl(supabase as any, storageRef)

    const uploadTypeMap: Record<string, any> = {
      'relay-tag.jpg': 'seller_tag_photo',
      'seller-pair.jpg': 'seller_pair_photo',
      'seller-box.jpg': 'seller_box_photo',
      'sealed-package.jpg': 'seller_sealed_package_photo',
      'buyer-tag-live.jpg': 'buyer_tag_photo',
      'buyer-pair-live.jpg': 'buyer_pair_photo',
    }

    const uploadType = uploadTypeMap[fileName.toLowerCase()]
    if (uploadType) {
      await recordCustodyUpload(supabase as any, {
        orderId,
        sellerId: order.seller_id || null,
        buyerId: order.buyer_id || null,
        actorRole: uploadType.startsWith('buyer_') ? 'buyer' : 'seller',
        uploadType,
        filePath: path,
        })
    }

    return NextResponse.json({
      url: signedUrl,
      signedUrl,
      storageRef,
    })
  } catch (error) {
    console.error('Upload photo error:', error)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
