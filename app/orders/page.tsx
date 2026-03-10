import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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
              rows.map(({ order, listing, buyer, seller, isBuyer }) => (
                <Link
                  key={order.id}
                  href={`/orders/${order.id}`}
                  className="block rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-5 text-white shadow-[0_10px_40px_rgba(0,0,0,0.18)] backdrop-blur-xl transition hover:bg-white/[0.055]"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
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

                      <p className="mt-2 text-sm text-white/50">
                        Status: <span className="font-medium text-white/80">{order.status}</span>
                      </p>

                      {order.tracking_code && (
                        <p className="mt-1 text-sm text-white/45">
                          Tracking: {order.tracking_code}
                        </p>
                      )}
                    </div>

                    <div className="shrink-0 text-right">
                      <p className="text-lg font-semibold text-white">
                        ${((order.total_amount_cents ?? order.amount_cents) / 100).toFixed(2)}
                      </p>
                      <p className="mt-2 text-xs text-white/40">
                        {new Date(order.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>
    </main>
  );
}