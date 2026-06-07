import { NextRequest, NextResponse } from "next/server";
import { createServerClientInstance } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import {
  fetchKicksDbSneakerBySku,
  type KicksDbSneakerLookupResult,
} from "../../../../../lib/sneakers/fetchKicksDbSneakerBySku";
import { normalizeSku } from "../../../../../lib/sneakers/normalizeSku";

type SneakerRecord = KicksDbSneakerLookupResult & {
  id: string;
};

export async function GET(request: NextRequest) {
  try {
    const rawSku = request.nextUrl.searchParams.get("sku");

    if (!rawSku) {
      return NextResponse.json({ error: "Missing sku parameter." }, { status: 400 });
    }

    const normalizedSku = normalizeSku(rawSku);

    if (!normalizedSku) {
      return NextResponse.json({ error: "Missing sku parameter." }, { status: 400 });
    }

    const supabase = await createServerClientInstance();
    const { data: localSneaker, error: localError } = await supabase
      .from("sneakers")
      .select(
        "id, sku, normalized_sku, brand, name, model, nickname, colorway, gender, release_date, retail_price, description, gallery_images, image_url, source"
      )
      .eq("normalized_sku", normalizedSku)
      .maybeSingle<SneakerRecord>();

    if (localError) {
      console.error("Sneaker local lookup error:", localError);
      return NextResponse.json({ error: "Failed to lookup sneaker." }, { status: 500 });
    }

    const localHasDescription = Boolean(localSneaker?.description);
    const localHasGalleryImages = Array.isArray(localSneaker?.gallery_images) && localSneaker.gallery_images.length > 0;

    if (localSneaker && localHasDescription && localHasGalleryImages) {
      return NextResponse.json({
        found: true,
        source: "local",
        sneaker: localSneaker,
      });
    }

    const externalSneaker = await fetchKicksDbSneakerBySku(normalizedSku);

    if (!externalSneaker || !externalSneaker.sku || !externalSneaker.normalized_sku || !externalSneaker.name) {
      if (localSneaker) {
        return NextResponse.json({
          found: true,
          source: "local",
          sneaker: localSneaker,
        });
      }

      return NextResponse.json({
        found: false,
        source: null,
        sneaker: null,
      });
    }

    const admin = createAdminClient();
    const { data: insertedSneaker, error: upsertError } = await admin
      .from("sneakers")
      .upsert(externalSneaker, {
        onConflict: "normalized_sku",
      })
      .select(
        "id, sku, normalized_sku, brand, name, model, nickname, colorway, gender, release_date, retail_price, description, gallery_images, image_url, source"
      )
      .single<SneakerRecord>();

    if (upsertError) {
      console.error("Sneaker upsert error:", upsertError);
      return NextResponse.json({ error: "Failed to store sneaker lookup result." }, { status: 500 });
    }

    return NextResponse.json({
      found: true,
      source: "kicksdb",
      sneaker: insertedSneaker,
    });
  } catch (error) {
    console.error("Sneaker lookup route error:", error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
