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
      <main className="min-h-screen bg-[#06070a] px-6 py-12 text-[#f5f0e6]">
        <div className="mx-auto max-w-5xl">
          <div className="rounded-[28px] border border-[#2a2d36] bg-[#0d1016]/90 p-8 shadow-[0_20px_80px_rgba(0,0,0,0.35)]">
            <p className="text-sm text-[#d6c2a0]">Failed to load orders: {error.message}</p>
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
    <main className="min-h-screen bg-[#06070a] text-[#f5f0e6]">
      <div className="mx-auto max-w-5xl px-6 py-12">
        <div className="rounded-[32px] border border-[#1f2330] bg-[radial-gradient(circle_at_top,#151924_0%,#0c0f15_50%,#090b10_100%)] p-8 shadow-[0_30px_120px_rgba(0,0,0,0.45)]">
          <p className="text-xs font-semibold uppercase tracking-[0.34em] text-[#d6c2a0]">
            Relay Orders
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
            Purchases and sales,
            <span className="block text-[#d6c2a0]">all in one place.</span>
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-[#a8adbb] sm:text-base">
            Track every transaction across Relay with a cleaner dashboard that matches the
            rest of the platform.
          </p>
        </div>

        <div className="mt-8 space-y-4">
          {rows.length === 0 ? (
            <div className="rounded-[28px] border border-[#222634] bg-[#0d1016]/90 p-8 shadow-[0_18px_60px_rgba(0,0,0,0.3)]">
              <p className="text-[#b7bdca]">No orders yet.</p>
            </div>
          ) : (
            rows.map(({ order, listing, buyer, seller, isBuyer }) => (
              <Link
                key={order.id}
                href={`/orders/${order.id}`}
                className="group block rounded-[28px] border border-[#222634] bg-[#0d1016]/90 p-6 shadow-[0_18px_60px_rgba(0,0,0,0.28)] transition duration-200 hover:-translate-y-0.5 hover:border-[#d6c2a0]/45 hover:bg-[#11151d]"
              >
                <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="rounded-full border border-[#3a3f4b] bg-[#141923] px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-[#d6c2a0]">
                        {order.status}
                      </span>
                      <span className="text-xs uppercase tracking-[0.2em] text-[#7e8596]">
                        {new Date(order.created_at).toLocaleDateString()}
                      </span>
                    </div>

                    <h2 className="mt-4 text-xl font-semibold text-[#f7f3eb] transition group-hover:text-[#ecd8b7]">
                      {listing
                        ? `${listing.brand} ${listing.model}${listing.nickname ? ` · ${listing.nickname}` : ""}`
                        : "Listing"}
                    </h2>

                    <p className="mt-2 text-sm text-[#b7bdca]">
                      {isBuyer
                        ? `Seller: @${seller?.username ?? "unknown"}`
                        : `Buyer: @${buyer?.username ?? "unknown"}`}
                    </p>

                    {order.tracking_code && (
                      <p className="mt-2 text-sm text-[#8d94a5]">
                        Tracking: <span className="text-[#d9deea]">{order.tracking_code}</span>
                      </p>
                    )}
                  </div>

                  <div className="shrink-0">
                    <p className="text-right text-sm uppercase tracking-[0.2em] text-[#7e8596]">
                      Total
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-[#ecd8b7]">
                      ${((order.total_amount_cents ?? order.amount_cents) / 100).toFixed(2)}
                    </p>
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </main>
  );
}