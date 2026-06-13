import { createClient } from "@supabase/supabase-js"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { buildStorageObjectRef, createSignedStorageUrl, sanitizeUploadedFileName } from "@/lib/secure-storage"
import { createAdminClient } from "@/lib/supabase-admin"
import { recordCustodyUpload } from "@/lib/relay-tags"

const MAX_FILE_SIZE = 10 * 1024 * 1024
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"])
const ALLOWED_FILE_NAMES = new Set(["buyer-tag-live.jpg", "buyer-pair-live.jpg"])

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orderId } = await params

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
              // Ignore cookie writes during SSR transitions.
            }
          },
        },
      }
    )

    const {
      data: { user },
    } = await supabaseAuth.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const storageClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const adminClient = createAdminClient()

    const { data: order, error: orderError } = await adminClient
      .from("orders")
      .select("id, buyer_id, seller_id, status")
      .eq("id", orderId)
      .single()

    if (orderError || !order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 })
    }

    if (order.buyer_id !== user.id) {
      return NextResponse.json({ error: "Only the buyer can upload buyer custody evidence" }, { status: 403 })
    }

    if (!["delivered", "review_window", "disputed"].includes(order.status)) {
      return NextResponse.json(
        { error: "Buyer custody capture is only available after delivery" },
        { status: 400 }
      )
    }

    const formData = await request.formData()
    const file = formData.get("file") as File | null
    const fileName = formData.get("fileName") as string | null

    if (!file || !fileName) {
      return NextResponse.json({ error: "Missing required fields: file and fileName" }, { status: 400 })
    }

    if (!ALLOWED_FILE_NAMES.has(fileName)) {
      return NextResponse.json({ error: "Invalid buyer custody upload type" }, { status: 400 })
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "File too large. Maximum size is 10MB." }, { status: 400 })
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ error: "Invalid file type. Only JPG, PNG, and WebP are allowed." }, { status: 400 })
    }

    const extension = sanitizeUploadedFileName(fileName).split(".").pop() || "jpg"
    const normalizedBaseName = fileName.startsWith("buyer-tag")
      ? "buyer-tag"
      : "buyer-pair"
    const path = `${orderId}/buyer-custody/${normalizedBaseName}-${user.id}-${Date.now()}.${extension}`
    const buffer = Buffer.from(await file.arrayBuffer())

    const { error: uploadError } = await storageClient.storage
      .from("order-photos")
      .upload(path, buffer, {
        upsert: false,
        contentType: file.type || "image/jpeg",
      })

    if (uploadError) {
      return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 })
    }

    const storageRef = buildStorageObjectRef("order-photos", path)
    const signedUrl = await createSignedStorageUrl(storageClient as any, storageRef)

    await recordCustodyUpload(adminClient, {
      orderId,
      sellerId: order.seller_id,
      buyerId: user.id,
      actorUserId: user.id,
      actorRole: "buyer",
      uploadType: normalizedBaseName === "buyer-tag" ? "buyer_tag_photo" : "buyer_pair_photo",
      filePath: storageRef,
    })

    return NextResponse.json({
      storageRef,
      signedUrl,
      url: signedUrl,
    })
  } catch (error) {
    console.error("Buyer custody upload error:", error)
    return NextResponse.json({ error: "Upload failed" }, { status: 500 })
  }
}
