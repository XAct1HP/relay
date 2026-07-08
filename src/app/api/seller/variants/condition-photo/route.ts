import { NextRequest, NextResponse } from "next/server";
import { createServerClientInstance } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";

const BUCKET = "profile-images";
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClientInstance();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const variantId = String(formData.get("variant_id") || "").trim();
    const file = formData.get("file");

    if (!variantId) {
      return NextResponse.json(
        { error: "variant_id is required." },
        { status: 400 }
      );
    }

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "A photo file is required." },
        { status: 400 }
      );
    }

    if (file.size <= 0) {
      return NextResponse.json(
        { error: "Photo file is empty." },
        { status: 400 }
      );
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "Photo must be 10 MB or smaller." },
        { status: 400 }
      );
    }

    if (!file.type.startsWith("image/")) {
      return NextResponse.json(
        { error: "Only image files are allowed." },
        { status: 400 }
      );
    }

    // Confirm the variant belongs to a listing owned by this seller.
    const { data: variantRow, error: variantError } = await supabase
      .from("listing_variants")
      .select("id, listing_id, listings!inner(seller_id)")
      .eq("id", variantId)
      .maybeSingle();

    if (variantError || !variantRow) {
      return NextResponse.json(
        { error: "Variant not found." },
        { status: 404 }
      );
    }

    const ownerId =
      (variantRow as unknown as { listings?: { seller_id?: string } }).listings
        ?.seller_id || null;
    if (ownerId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const adminClient = createAdminClient();
    const extension = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `${user.id}/condition-photos/${variantId}-${Date.now()}.${extension}`;

    const bytes = new Uint8Array(await file.arrayBuffer());
    const { error: uploadError } = await adminClient.storage
      .from(BUCKET)
      .upload(path, bytes, {
        contentType: file.type,
        cacheControl: "3600",
        upsert: true,
      });

    if (uploadError) {
      return NextResponse.json(
        { error: uploadError.message || "Photo upload failed." },
        { status: 500 }
      );
    }

    const { data: publicUrlData } = adminClient.storage
      .from(BUCKET)
      .getPublicUrl(path);
    const publicUrl = publicUrlData.publicUrl;

    const { error: updateError } = await adminClient
      .from("listing_variants")
      .update({
        condition_photo_url: publicUrl,
        needs_condition_photo: false,
        is_active: true,
      })
      .eq("id", variantId);

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message || "Failed to update variant." },
        { status: 500 }
      );
    }

    // If the parent listing was flipped to sold_out because every variant was
    // pending a photo, bring it back to active now that this variant is live.
    const listingId = (
      variantRow as unknown as { listing_id?: string }
    ).listing_id;
    if (listingId) {
      const { data: parentListing } = await adminClient
        .from("listings")
        .select("id, status")
        .eq("id", listingId)
        .maybeSingle();
      if (parentListing?.status === "sold_out") {
        await adminClient
          .from("listings")
          .update({ status: "active" })
          .eq("id", listingId);
      }
    }

    return NextResponse.json({
      success: true,
      variant_id: variantId,
      condition_photo_url: publicUrl,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to upload condition photo.",
      },
      { status: 500 }
    );
  }
}
