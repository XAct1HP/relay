import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function getStatusBadge(status: string) {
  const normalized = status.toLowerCase();

  if (normalized === "paid") {
    return {
      label: "Paid",
      className:
        "border-emerald-400/20 bg-emerald-400/12 text-emerald-200",
    };
  }

  if (normalized === "label_created") {
    return {
      label: "Label Created",
      className:
        "border-sky-400/20 bg-sky-400/12 text-sky-200",
    };
  }

  if (normalized === "shipped") {
    return {
      label: "Shipped",
      className:
        "border-blue-400/20 bg-blue-400/12 text-blue-200",
    };
  }

  if (normalized === "in_transit") {
    return {
      label: "In Transit",
      className:
        "border-violet-400/20 bg-violet-400/12 text-violet-200",
    };
  }

  if (normalized === "out_for_delivery") {
    return {
      label: "Out for Delivery",
      className:
        "border-amber-400/20 bg-amber-400/12 text-amber-200",
    };
  }

  if (normalized === "delivered") {
    return {
      label: "Delivered",
      className:
        "border-teal-400/20 bg-teal-400/12 text-teal-200",
    };
  }

  if (normalized === "completed") {
    return {
      label: "Completed",
      className:
        "border-green-400/20 bg-green-400/12 text-green-200",
    };
  }

  if (normalized === "pending") {
    return {
      label: "Pending",
      className:
        "border-yellow-400/20 bg-yellow-400/12 text-yellow-200",
    };
  }

  if (normalized === "cancelled") {
    return {
      label: "Cancelled",
      className:
        "border-red-400/20 bg-red-400/12 text-red-200",
    };
  }

  return {
    label: status.replaceAll("_", " "),
    className:
      "border-white/10 bg-white/[0.05] text-white/75",
  };
}

export default async function OrdersPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const { data: orders, error } = await supabase
    .from("orders")
    .select(
      "id, listing_id, buyer_id, seller_id, amount_cents, shipping_amount_cents, total_amount_cents, status, created_at, tracking_code"
    )
    .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`)
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <main className="relay-page">
        <div className="relay-site-bg" />
        <div className="relay-page-shell">
          <div className="mx-auto max-w-5xl">
            <p className="text-white">Failed to load orders: {error.message}</p>
          </div>
        </div>
      </main>
    );
  }

  const rows = await Promise.all(
    (orders ?? []).map(async (order) => {
      const [listingResult, buyerResult, sellerResult] = await Promise.all([
        supabase
          .from("listings")
          .select("brand, model, nickname")
          .eq("id", order.listing_id)
          .maybeSingle(),
        supabase
          .from("profiles")
          .select("username")
          .eq("id", order.buyer_id)
          .maybeSingle(),
        supabase
          .from("profiles")
          .select("username")
          .eq("id", order.seller_id)
          .maybeSingle(),
      ]);

      return {
        order,
        listing: listingResult.data,
        buyer: buyerResult.data,
        seller: sellerResult.data,
        isBuyer: order.buyer_id === user.id,
      };
    })
  );

  return (
    <main className="relay-page">
      <div className="relay-site-bg" />
      <div className="relay-page-shell">
        <div className="mx-auto max-w-5xl">
          <p className="relay-eyebrow">Relay</p>
          <h1 className="relay-title">Orders</h1>
          <p className="relay-subtitle">Track purchases and sales on Relay.</p>

          <div className="mt-8 space-y-4">
            {rows.length === 0 ? (
              <div className="relay-empty">
                <p>No orders yet.</p>
              </div>
            ) : (
              rows.map(({ order, listing, buyer, seller, isBuyer }) => {
                const badge = getStatusBadge(order.status);

                return (
                  <Link
                    key={order.id}
                    href={`/orders/${order.id}`}
                    className="block rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-5 text-white shadow-[0_10px_40px_rgba(0,0,0,0.18)] backdrop-blur-xl transition hover:bg-white/[0.055]"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="mb-3 flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full border px-3 py-1 text-xs font-semibold ${badge.className}`}
                          >
                            {badge.label}
                          </span>

                          <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-medium text-white/45">
                            {new Date(order.created_at).toLocaleDateString()}
                          </span>
                        </div>

                        <h2 className="text-lg font-semibold text-white">
                          {listing
                            ? `${listing.brand} ${listing.model}${listing.nickname ? ` · ${listing.nickname}` : ""}`
                            : "Listing"}
                        </h2>

                        <p className="mt-2 text-sm text-white/60">
                          {isBuyer
                            ? `Seller: @${seller?.username ?? "unknown"}`
                            : `Buyer: @${buyer?.username ?? "unknown"}`}
                        </p>

                        {order.tracking_code && (
                          <p className="mt-2 text-sm text-white/45">
                            Tracking: {order.tracking_code}
                          </p>
                        )}
                      </div>

                      <div className="shrink-0 text-right">
                        <p className="text-lg font-semibold text-white">
                          ${((order.total_amount_cents ?? order.amount_cents) / 100).toFixed(2)}
                        </p>
                        <p className="mt-2 text-xs text-white/40">
                          Total
                        </p>
                      </div>
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </div>
      </div>
    </main>
  );
}