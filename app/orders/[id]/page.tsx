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

function getStatusBadge(status: string) {
  const normalized = status.toLowerCase();

  if (normalized === "paid") {
    return {
      label: "Paid",
      className: "border-emerald-400/20 bg-emerald-400/12 text-emerald-200",
    };
  }

  if (normalized === "label_created") {
    return {
      label: "Label Created",
      className: "border-sky-400/20 bg-sky-400/12 text-sky-200",
    };
  }

  if (normalized === "shipped") {
    return {
      label: "Shipped",
      className: "border-blue-400/20 bg-blue-400/12 text-blue-200",
    };
  }

  if (normalized === "in_transit") {
    return {
      label: "In Transit",
      className: "border-violet-400/20 bg-violet-400/12 text-violet-200",
    };
  }

  if (normalized === "out_for_delivery") {
    return {
      label: "Out for Delivery",
      className: "border-amber-400/20 bg-amber-400/12 text-amber-200",
    };
  }

  if (normalized === "delivered") {
    return {
      label: "Delivered",
      className: "border-teal-400/20 bg-teal-400/12 text-teal-200",
    };
  }

  if (normalized === "completed") {
    return {
      label: "Completed",
      className: "border-green-400/20 bg-green-400/12 text-green-200",
    };
  }

  if (normalized === "pending") {
    return {
      label: "Pending",
      className: "border-yellow-400/20 bg-yellow-400/12 text-yellow-200",
    };
  }

  if (normalized === "cancelled") {
    return {
      label: "Cancelled",
      className: "border-red-400/20 bg-red-400/12 text-red-200",
    };
  }

  return {
    label: status.replaceAll("_", " "),
    className: "border-white/10 bg-white/[0.05] text-white/75",
  };
}

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

  const badge = getStatusBadge(order.status);

  return (
    <main className="relay-page">
      <div className="relay-site-bg" />
      <div className="relay-page-shell">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="relay-eyebrow">Relay</p>
              <h1 className="relay-title">Order Details</h1>
              <p className="relay-subtitle">
                Track the status, shipping progress, and next action for this transaction.
              </p>
            </div>

            <Link
              href="/orders"
              className="rounded-full border border-white/12 bg-white/[0.04] px-4 py-2 text-sm font-medium text-white transition hover:bg-white/[0.06]"
            >
              Back to Orders
            </Link>
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="space-y-6">
              <section className="overflow-hidden rounded-[1.9rem] border border-white/10 bg-white/[0.04] shadow-[0_10px_40px_rgba(0,0,0,0.18)] backdrop-blur-xl">
                <div className="border-b border-white/10 bg-white/[0.03] px-6 py-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-xs uppercase tracking-[0.22em] text-white/38">
                        Order Overview
                      </p>
                      <h2 className="mt-2 text-2xl font-semibold text-white">
                        {listing
                          ? `${listing.brand} ${listing.model}${listing.nickname ? ` · ${listing.nickname}` : ""}`
                          : "Listing"}
                      </h2>
                    </div>

                    <div className={`rounded-full border px-3 py-1 text-xs font-semibold ${badge.className}`}>
                      {badge.label}
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 p-6 sm:grid-cols-2">
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
                    <p className="text-sm text-white/50">Placed</p>
                    <p className="mt-2 text-lg font-semibold text-white">
                      {new Date(order.created_at).toLocaleDateString()}
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
                </div>
              </section>

              <section className="rounded-[1.9rem] border border-white/10 bg-white/[0.04] p-6 shadow-[0_10px_40px_rgba(0,0,0,0.18)] backdrop-blur-xl">
                <div className="mb-5">
                  <p className="text-xs uppercase tracking-[0.22em] text-white/38">
                    Payment Breakdown
                  </p>
                  <h3 className="mt-2 text-xl font-semibold text-white">
                    Charges
                  </h3>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.03] p-4">
                    <p className="text-sm text-white/50">Item Amount</p>
                    <p className="mt-2 text-xl font-semibold text-white">
                      ${(order.amount_cents / 100).toFixed(2)}
                    </p>
                  </div>

                  <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.03] p-4">
                    <p className="text-sm text-white/50">Shipping</p>
                    <p className="mt-2 text-xl font-semibold text-white">
                      ${(order.shipping_amount_cents / 100).toFixed(2)}
                    </p>
                    <p className="mt-1 text-sm text-white/45">
                      {order.shipping_carrier && order.shipping_service
                        ? `${order.shipping_carrier} · ${order.shipping_service}`
                        : "Label not purchased yet"}
                    </p>
                  </div>

                  <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.03] p-4">
                    <p className="text-sm text-white/50">Total Paid</p>
                    <p className="mt-2 text-xl font-semibold text-white">
                      ${((order.total_amount_cents ?? order.amount_cents) / 100).toFixed(2)}
                    </p>
                  </div>
                </div>
              </section>

              {order.status === "completed" && user.id === order.buyer_id && !existingReview && (
                <section className="rounded-[1.9rem] border border-white/10 bg-white/[0.04] p-6 shadow-[0_10px_40px_rgba(0,0,0,0.18)] backdrop-blur-xl">
                  <div className="mb-5">
                    <p className="text-xs uppercase tracking-[0.22em] text-white/38">
                      Review
                    </p>
                    <h3 className="mt-2 text-xl font-semibold text-white">
                      Leave feedback
                    </h3>
                  </div>

                  <ReviewForm
                    orderId={order.id}
                    reviewerId={order.buyer_id}
                    revieweeId={order.seller_id}
                  />
                </section>
              )}

              {existingReview && (
                <section className="rounded-[1.9rem] border border-white/10 bg-white/[0.04] p-6 shadow-[0_10px_40px_rgba(0,0,0,0.18)] backdrop-blur-xl">
                  <div className="mb-5">
                    <p className="text-xs uppercase tracking-[0.22em] text-white/38">
                      Review
                    </p>
                    <h3 className="mt-2 text-xl font-semibold text-white">
                      Review Submitted
                    </h3>
                  </div>

                  <p className="text-white/60">
                    Rating: <span className="font-medium text-white">{existingReview.rating}/5</span>
                  </p>
                  <p className="mt-3 text-white/75">
                    {existingReview.comment || "No comment provided."}
                  </p>
                </section>
              )}
            </div>

            <div className="space-y-6">
              <section className="rounded-[1.9rem] border border-white/10 bg-white/[0.04] p-6 shadow-[0_10px_40px_rgba(0,0,0,0.18)] backdrop-blur-xl">
                <div className="mb-5">
                  <p className="text-xs uppercase tracking-[0.22em] text-white/38">
                    Actions
                  </p>
                  <h3 className="mt-2 text-xl font-semibold text-white">
                    Next steps
                  </h3>
                </div>

                <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.03] p-4">
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
              </section>

              <section className="rounded-[1.9rem] border border-white/10 bg-white/[0.04] p-6 shadow-[0_10px_40px_rgba(0,0,0,0.18)] backdrop-blur-xl">
                <div className="mb-5">
                  <p className="text-xs uppercase tracking-[0.22em] text-white/38">
                    Shipping
                  </p>
                  <h3 className="mt-2 text-xl font-semibold text-white">
                    Fulfillment details
                  </h3>
                </div>

                <div className="space-y-4">
                  <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.03] p-4">
                    <p className="text-sm text-white/50">Carrier / Service</p>
                    <p className="mt-2 text-white font-semibold">
                      {order.shipping_carrier && order.shipping_service
                        ? `${order.shipping_carrier} · ${order.shipping_service}`
                        : "Not generated yet"}
                    </p>
                  </div>

                  <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.03] p-4">
                    <p className="text-sm text-white/50">Tracking Code</p>
                    <p className="mt-2 text-white font-semibold">
                      {order.tracking_code || "Not available yet"}
                    </p>
                  </div>

                  <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.03] p-4">
                    <p className="text-sm text-white/50">Latest Update</p>
                    <p className="mt-2 text-white font-semibold">
                      {order.last_tracking_status || "No tracking events yet"}
                    </p>
                  </div>
                </div>
              </section>

              {listing && (
                <section className="rounded-[1.9rem] border border-white/10 bg-white/[0.04] p-6 shadow-[0_10px_40px_rgba(0,0,0,0.18)] backdrop-blur-xl">
                  <p className="text-xs uppercase tracking-[0.22em] text-white/38">
                    Listing
                  </p>
                  <h3 className="mt-2 text-xl font-semibold text-white">
                    View original listing
                  </h3>

                  <Link
                    href={`/listings/${listing.id}`}
                    className="mt-5 inline-flex rounded-full border border-white/12 bg-white/[0.05] px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/[0.08]"
                  >
                    Open Listing
                  </Link>
                </section>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}