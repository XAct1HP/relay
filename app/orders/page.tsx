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
    .select("id, listing_id, buyer_id, seller_id, amount_cents, status, created_at")
    .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`)
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <main className="min-h-screen bg-slate-50 px-6 py-12 text-slate-900">
        <div className="mx-auto max-w-5xl">
          <p>Failed to load orders: {error.message}</p>
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
    <main className="min-h-screen bg-slate-50 px-6 py-12 text-slate-900">
      <div className="mx-auto max-w-5xl">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">
          Relay
        </p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight">Orders</h1>
        <p className="mt-3 text-slate-600">
          Track purchases and sales on Relay.
        </p>

        <div className="mt-8 space-y-4">
          {rows.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
              <p className="text-slate-600">No orders yet.</p>
            </div>
          ) : (
            rows.map(({ order, listing, buyer, seller, isBuyer }) => (
              <Link
                key={order.id}
                href={`/orders/${order.id}`}
                className="block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold">
                      {listing
                        ? `${listing.brand} ${listing.model}${listing.nickname ? ` · ${listing.nickname}` : ""}`
                        : "Listing"}
                    </h2>

                    <p className="mt-2 text-sm text-slate-600">
                      {isBuyer
                        ? `Seller: @${seller?.username ?? "unknown"}`
                        : `Buyer: @${buyer?.username ?? "unknown"}`}
                    </p>

                    <p className="mt-2 text-sm text-slate-500">
                      Status: <span className="font-medium">{order.status}</span>
                    </p>
                  </div>

                  <p className="text-lg font-bold">
                    ${(order.amount_cents / 100).toFixed(2)}
                  </p>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </main>
  );
}