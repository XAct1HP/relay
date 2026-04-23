import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

/**
 * Server-side upload endpoint for dispute evidence photos.
 * Uses the service role key to bypass storage RLS policies.
 * Authenticates the user via session and verifies they are
 * the buyer or seller on the order.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orderId } = await params

    // Authenticate user via session
    const cookieStore = await cookies()
    const supabaseAuth = createServerClient(
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
    } = await supabaseAuth.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Use service role client for storage operations (bypasses RLS)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Verify user is buyer or seller on this order
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, buyer_id, seller_id, status')
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    const isBuyer = order.buyer_id === user.id
    const isSeller = order.seller_id === user.id

    if (!isBuyer && !isSeller) {
      return NextResponse.json(
        { error: 'You are not a party to this order' },
        { status: 403 }
      )
    }

    // Parse the uploaded file
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const fileName = formData.get('fileName') as string | null

    if (!file || !fileName) {
      return NextResponse.json(
        { error: 'Missing required fields: file, fileName' },
        { status: 400 }
      )
    }

    // Upload to storage using service role key
    const path = `${orderId}/${fileName}`
    const buffer = Buffer.from(await file.arrayBuffer())

    const { error: uploadError } = await supabase.storage
      .from('order-photos')
      .upload(path, buffer, {
        upsert: true,
        contentType: file.type || 'image/jpeg',
      })

    if (uploadError) {
      console.error('Evidence upload error:', uploadError)
      return NextResponse.json(
        { error: `Upload failed: ${uploadError.message}` },
        { status: 500 }
      )
    }

    const { data: urlData } = supabase.storage
      .from('order-photos')
      .getPublicUrl(path)

    return NextResponse.json({ url: urlData.publicUrl })
  } catch (error) {
    console.error('Evidence upload error:', error)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
