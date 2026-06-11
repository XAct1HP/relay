import { NextResponse } from "next/server";
import { createServerClientInstance } from "@/lib/supabase-server";
import { determineSellerTagInventoryPolicy } from "@/lib/relay-tags";

export async function GET() {
  try {
    const supabase = await createServerClientInstance();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [profileResult, tagsResult, requestsResult] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, seller_tier, seller_application_status, is_verified_seller")
        .eq("id", user.id)
        .single(),
      supabase
        .from("relay_tags")
        .select("*")
        .eq("assigned_seller_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("seller_tag_requests")
        .select("*")
        .eq("seller_id", user.id)
        .order("created_at", { ascending: false }),
    ]);

    if (profileResult.error || !profileResult.data) {
      return NextResponse.json({ error: profileResult.error?.message || "Profile not found" }, { status: 404 });
    }

    const tags = tagsResult.data || [];
    const availableTags = tags.filter((tag) => tag.status === "assigned_to_seller");
    const usedTags = tags.filter((tag) =>
      ["bound_to_order", "submitted_by_seller", "shipped", "buyer_scanned", "completed", "disputed"].includes(tag.status)
    );

    const policy = determineSellerTagInventoryPolicy(profileResult.data.seller_tier);

    return NextResponse.json({
      profile: profileResult.data,
      policy,
      counts: {
        available: availableTags.length,
        used: usedTags.length,
        needsMore: availableTags.length <= Math.max(10, Math.ceil(policy.defaultRequestQuantity * 0.1)),
      },
      availableTags,
      usedTags,
      requests: requestsResult.data || [],
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load seller tags" },
      { status: 500 }
    );
  }
}
