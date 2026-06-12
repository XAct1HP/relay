import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orderId } = await params;
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {}
          },
        },
      }
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { status, trackingNumber, carrier, adminNotes } = body;

    const validStatuses = ["processing", "shipped", "fulfilled"];
    if (!status || !validStatuses.includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const updatePayload: Record<string, unknown> = { status };

    if (status === "shipped") {
      updatePayload.shipped_at = new Date().toISOString();
      if (trackingNumber) updatePayload.shipping_tracking_number = trackingNumber;
      if (carrier) updatePayload.shipping_carrier = carrier;
    }

    if (status === "fulfilled") {
      updatePayload.fulfilled_at = new Date().toISOString();
    }

    if (adminNotes !== undefined) {
      updatePayload.admin_notes = adminNotes;
    }

    const { error: updateError } = await supabase
      .from("tag_orders")
      .update(updatePayload)
      .eq("id", orderId);

    if (updateError) {
      console.error("Tag order update error:", updateError);
      return NextResponse.json({ error: "Failed to update tag order" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Admin tag order update error:", error);
    return NextResponse.json({ error: "Failed to update tag order" }, { status: 500 });
  }
}
