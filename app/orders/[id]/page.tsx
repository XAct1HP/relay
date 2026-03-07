import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import OrderActions from "@/app/components/order-actions";
import ReviewForm from "@/app/components/review-form";

type OrderPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function OrderPage({ params }: OrderPageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const { data: order, error } = await supabase
    .from("orders")
    .select("id, listing_id, buyer_id, seller_id, amount_cents, status, created_at")
    .eq("id", id)
    .single();

  if (error || !order) {
    notFound();
  }

  const isParticipant =
    order.buyer_id === user.id || order.seller_id === user.id;

  if (!isParticipant) {
    redirect("/orders");
  }

  const [listingResult, buyerResult, sellerResult] = await Promise.all([
    supabase
      .from("listings")
      .select("id, brand, model, nickname, status")
      .eq("id", order.listing_id)
      .single(),
    supabase
      .from("profiles")
      .select("username")
      .eq("id", order.buyer_id)
      .single(),
    supabase
      .from("profiles")
      .select("username")
      .eq("id", order.seller_id)
      .single(),
  ]);

  const listing = listingResult.data;
  const buyer = buyerResult.data;
  const seller = sellerResult.data;
  
  const { data: existingReview } = await supabase
    .from("reviews")
    .select("id, rating, comment, created_at")
    .eq("order_id", order.id)
    .maybeSingle();

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-12 text-slate-900">
      <div className="mx-auto max-w-4xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">
              Relay
            </p>
            <h1 className="mt-2 text-4xl font-bold tracking-tight">Order</h1>
            <p className="mt-3 text-slate-600">
              Track the status of this transaction.
            </p>
          </div>

          <Link
            href="/orders"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100"
          >
            Back to Orders
          </Link>
        </div>

        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <h2 className="text-2xl font-semibold">
            {listing
              ? `${listing.brand} ${listing.model}${listing.nickname ? ` · ${listing.nickname}` : ""}`
              : "Listing"}
          </h2>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 p-4">
              <p className="text-sm text-slate-500">Buyer</p>
              <p className="mt-2 text-lg font-semibold">@{buyer?.username ?? "unknown"}</p>
            </div>

            <div className="rounded-xl border border-slate-200 p-4">
              <p className="text-sm text-slate-500">Seller</p>
              <p className="mt-2 text-lg font-semibold">@{seller?.username ?? "unknown"}</p>
            </div>

            <div className="rounded-xl border border-slate-200 p-4">
              <p className="text-sm text-slate-500">Order Status</p>
              <p className="mt-2 text-lg font-semibold">{order.status}</p>
            </div>

            <div className="rounded-xl border border-slate-200 p-4">
              <p className="text-sm text-slate-500">Amount</p>
              <p className="mt-2 text-lg font-semibold">
                ${(order.amount_cents / 100).toFixed(2)}
              </p>
            </div>
          </div>

          <OrderActions
            orderId={order.id}
            listingId={order.listing_id}
            currentUserId={user.id}
            buyerId={order.buyer_id}
            sellerId={order.seller_id}
            status={order.status}
          />

        {order.status === "completed" && user.id === order.buyer_id && !existingReview && (
            <ReviewForm
              orderId={order.id}
              reviewerId={order.buyer_id}
              revieweeId={order.seller_id}
            />
          )}

          {existingReview && (
            <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-xl font-semibold">Review Submitted</h3>
              <p className="mt-3 text-slate-600">
                Rating: <span className="font-medium">{existingReview.rating}/5</span>
              </p>
              <p className="mt-2 text-slate-700">
                {existingReview.comment || "No comment provided."}
              </p>
            </div>
          )}

          {listing && (
            <div className="mt-8">
              <Link
                href={`/listings/${listing.id}`}
                className="text-sm font-medium text-slate-900 underline"
              >
                View Listing
              </Link>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}