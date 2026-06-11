import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { recordCustodyUpload } from '@/lib/relay-tags'

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

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Verify challenge code
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, challenge_code, status, seller_id, buyer_id')
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    if (order.challenge_code?.toUpperCase() !== challengeCode?.toUpperCase()) {
      return NextResponse.json({ error: 'Invalid challenge code' }, { status: 403 })
    }

    if (order.status !== 'paid') {
      return NextResponse.json(
        { error: 'Order is not awaiting authentication' },
        { status: 400 }
      )
    }

    // Upload file to storage
    const path = `${orderId}/${fileName}`
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

    const { data: urlData } = supabase.storage
      .from('order-photos')
      .getPublicUrl(path)

    const uploadTypeMap: Record<string, any> = {
      'relay-tag.jpg': 'seller_tag_photo',
      'seller-pair.jpg': 'seller_pair_photo',
      'seller-box.jpg': 'seller_box_photo',
      'sealed-package.jpg': 'seller_sealed_package_photo',
      'buyer-tag.jpg': 'buyer_tag_photo',
      'buyer-pair.jpg': 'buyer_pair_photo',
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

    return NextResponse.json({ url: urlData.publicUrl })
  } catch (error) {
    console.error('Upload photo error:', error)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
