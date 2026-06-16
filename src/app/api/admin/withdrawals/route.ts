import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-access";

export async function GET() {
  try {
    const { adminClient } = await requireAdminSession();
    const { data, error } = await adminClient
      .from("withdrawal_requests")
      .select(`
        *,
        seller:profiles!withdrawal_requests_seller_id_fkey(
          id,
          display_name,
          full_name,
          username,
          email,
          stripe_account_id
        )
      `)
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(error.message || "Failed to load withdrawal history");
    }

    const withdrawals = (data || []).map((row: any) => ({
      ...row,
      seller: Array.isArray(row.seller) ? row.seller[0] || null : row.seller || null,
    }));

    return NextResponse.json({
      withdrawals,
      counts: {
        total: withdrawals.length,
        pending: withdrawals.filter((item) => item.status === "pending").length,
        processing: withdrawals.filter((item) => item.status === "processing").length,
        completed: withdrawals.filter((item) => item.status === "completed").length,
        failed: withdrawals.filter((item) => item.status === "failed").length,
        canceled: withdrawals.filter((item) => item.status === "canceled").length,
        reviewRequired: withdrawals.filter((item) => item.review_required).length,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load withdrawal history";

    return NextResponse.json(
      { error: message },
      { status: message === "Unauthorized" ? 401 : 403 }
    );
  }
}
