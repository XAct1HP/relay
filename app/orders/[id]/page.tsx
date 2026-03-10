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
    .select(`
      id,
      listing_id,
      buyer_id,
      seller_id,
      amount_cents,
      shipping_amount_cents,
      total_amount_cents,
      status,
      created_at,
      tracking_code,
      shipping_carrier,
      shipping_service,
      shipping_label_url,
      last_tracking_status
    `)
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
    <main className="relay-page">
      <div className="relay-site-bg" />
      <div className="relay-page-shell">
        <div className="mx-auto max-w-5xl">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="relay-eyebrow">Relay</p>
              <h1 className="relay-title">Order</h1>
              <p className="relay-subtitle">Track the status of this transaction.</p>
            </div>

            <Link
              href="/orders"
              className="rounded-full border border-white/12 bg-white/[0.04] px-4 py-2 text-sm font-medium text-white transition hover:bg-white/[0.06]"
            >
              Back to Orders
            </Link>
          </div>

          <div className="mt-8 rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-6 text-white shadow-[0_10px_40px_rgba(0,0,0,0.18)] backdrop-blur-xl">
            <h2 className="text-2xl font-semibold text-white">
              {listing
                ? `${listing.brand} ${listing.model}${listing.nickname ? ` · ${listing.nickname}` : ""}`
                : "Listing"}
            </h2>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.03] p-4">
                <p className="text-sm text-white/50">Buyer</p>
                <p className="mt-2 text-lg font-semibold text-white">
                  @{buyer?.username ?? "unknown"}
                </p>
              </div>

              <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.03] p-4">
                <p className="text-sm text-white/50">Seller</p>
                <p className="mt-2 text-lg font-semibold text-white">
                  @{seller?.username ?? "unknown"}
                </p>
              </div>

              <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.03] p-4">
                <p className="text-sm text-white/50">Order Status</p>
                <p className="mt-2 text-lg font-semibold text-white">{order.status}</p>
              </div>

              <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.03] p-4">
                <p className="text-sm text-white/50">Item Amount</p>
                <p className="mt-2 text-lg font-semibold text-white">
                  ${(order.amount_cents / 100).toFixed(2)}
                </p>
              </div>

              <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.03] p-4">
                <p className="text-sm text-white/50">Shipping</p>
                <p className="mt-2 text-lg font-semibold text-white">
                  ${(order.shipping_amount_cents / 100).toFixed(2)}
                </p>
                <p className="mt-1 text-sm text-white/45">
                  {order.shipping_carrier && order.shipping_service
                    ? `${order.shipping_carrier} · ${order.shipping_service}`
                    : "Label not purchased yet"}
                </p>
              </div>

              <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.03] p-4">
                <p className="text-sm text-white/50">Tracking Status</p>
                <p className="mt-2 text-lg font-semibold text-white">
                  {order.last_tracking_status ?? "Not available yet"}
                </p>
                {order.tracking_code && (
                  <p className="mt-1 text-sm text-white/45">{order.tracking_code}</p>
                )}
              </div>

              <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.03] p-4 sm:col-span-2">
                <p className="text-sm text-white/50">Total Paid</p>
                <p className="mt-2 text-lg font-semibold text-white">
                  ${((order.total_amount_cents ?? order.amount_cents) / 100).toFixed(2)}
                </p>
              </div>
            </div>

            <div className="mt-6 rounded-[1.25rem] border border-white/10 bg-white/[0.03] p-4">
              <OrderActions
                orderId={order.id}
                listingId={order.listing_id}
                currentUserId={user.id}
                buyerId={order.buyer_id}
                sellerId={order.seller_id}
                status={order.status}
                shippingLabelUrl={order.shipping_label_url}
                trackingCode={order.tracking_code}
              />
            </div>

            {order.status === "completed" && user.id === order.buyer_id && !existingReview && (
              <div className="mt-6 rounded-[1.25rem] border border-white/10 bg-white/[0.03] p-4">
                <ReviewForm
                  orderId={order.id}
                  reviewerId={order.buyer_id}
                  revieweeId={order.seller_id}
                />
              </div>
            )}

            {existingReview && (
              <div className="mt-6 rounded-[1.25rem] border border-white/10 bg-white/[0.03] p-6">
                <h3 className="text-xl font-semibold text-white">Review Submitted</h3>
                <p className="mt-3 text-white/60">
                  Rating: <span className="font-medium text-white">{existingReview.rating}/5</span>
                </p>
                <p className="mt-2 text-white/75">
                  {existingReview.comment || "No comment provided."}
                </p>
              </div>
            )}

            {listing && (
              <div className="mt-8">
                <Link
                  href={`/listings/${listing.id}`}
                  className="text-sm font-medium text-white/80 underline underline-offset-4"
                >
                  View Listing
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}