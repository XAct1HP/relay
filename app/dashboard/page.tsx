import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, username, bio, average_rating, total_reviews, total_sales")
    .eq("id", user.id)
    .single();

  if (error || !profile) {
    redirect("/onboarding");
  }

  const isDefaultUsername = profile.username.startsWith("user_");

  if (isDefaultUsername) {
    redirect("/onboarding");
  }

  const [
    listingsResult,
    ordersResult,
    buyerOrdersResult,
    conversationsResult,
  ] = await Promise.all([
    supabase
      .from("listings")
      .select("id, brand, model, nickname, price_cents, status, created_at")
      .eq("seller_id", user.id)
      .order("created_at", { ascending: false }),

    supabase
      .from("orders")
      .select("id, status, listing_id, amount_cents, created_at")
      .eq("seller_id", user.id)
      .order("created_at", { ascending: false }),

    supabase
      .from("orders")
      .select("id, status, listing_id, amount_cents, created_at")
      .eq("buyer_id", user.id)
      .order("created_at", { ascending: false }),

    supabase
      .from("conversations")
      .select("id")
      .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`),
  ]);

  const listings = listingsResult.data ?? [];
  const sellerOrders = ordersResult.data ?? [];
  const buyerOrders = buyerOrdersResult.data ?? [];
  const conversations = conversationsResult.data ?? [];

  const activeListingsCount = listings.filter(
    (listing) => listing.status === "active"
  ).length;

  const soldListingsCount = listings.filter(
    (listing) => listing.status === "sold"
  ).length;

  const pendingOrdersCount = sellerOrders.filter((order) =>
    ["paid", "shipped"].includes(order.status)
  ).length;

  const recentListings = listings.slice(0, 3);
  const recentSellerOrders = sellerOrders.slice(0, 3);
  const recentBuyerOrders = buyerOrders.slice(0, 3);

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-12 text-slate-900">
      <div className="mx-auto max-w-6xl">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">
          Relay
        </p>

        <h1 className="mt-2 text-4xl font-bold tracking-tight">
          Dashboard
        </h1>

        <p className="mt-3 text-slate-600">
          Welcome back, <span className="font-medium">@{profile.username}</span>
        </p>

        <div className="mt-8 grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-medium text-slate-500">Active Listings</p>
            <p className="mt-3 text-3xl font-bold tracking-tight">
              {activeListingsCount}
            </p>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-medium text-slate-500">Completed Sales</p>
            <p className="mt-3 text-3xl font-bold tracking-tight">
              {profile.total_sales}
            </p>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-medium text-slate-500">Pending Orders</p>
            <p className="mt-3 text-3xl font-bold tracking-tight">
              {pendingOrdersCount}
            </p>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-medium text-slate-500">Conversations</p>
            <p className="mt-3 text-3xl font-bold tracking-tight">
              {conversations.length}
            </p>
          </div>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">
            <p className="text-sm font-medium text-slate-500">Profile Bio</p>
            <p className="mt-3 leading-7 text-slate-800">
              {profile.bio || "No bio yet."}
            </p>

            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-sm text-slate-500">Rating</p>
                <p className="mt-2 text-2xl font-semibold">{profile.average_rating}</p>
              </div>

              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-sm text-slate-500">Reviews</p>
                <p className="mt-2 text-2xl font-semibold">{profile.total_reviews}</p>
              </div>

              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-sm text-slate-500">Sold Listings</p>
                <p className="mt-2 text-2xl font-semibold">{soldListingsCount}</p>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-medium text-slate-500">Quick Actions</p>

            <div className="mt-4 flex flex-col gap-3">
              <a
                href={`/profile/${profile.username}`}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                View Public Profile
              </a>

              <a
                href="/sell"
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100"
              >
                Create Listing
              </a>

              <a
                href="/my-listings"
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100"
              >
                My Listings
              </a>

              <a
                href="/messages"
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100"
              >
                Inbox
              </a>

              <a
                href="/orders"
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100"
              >
                Orders
              </a>

              <a
                href="/onboarding"
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100"
              >
                Edit Profile
              </a>

              <button
                onClick={async () => {
                  const res = await fetch("/api/stripe/connect", {
                    method: "POST",
                  });

                  const data = await res.json();

                  if (data.url) {
                    window.location.href = data.url;
                  }
                }}
                className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
              >
                Enable Seller Payouts
              </button>
            </div>
          </div>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold">Recent Listings</h2>

            <div className="mt-4 space-y-3">
              {recentListings.length === 0 ? (
                <p className="text-sm text-slate-500">No listings yet.</p>
              ) : (
                recentListings.map((listing) => (
                  <a
                    key={listing.id}
                    href={`/listings/${listing.id}`}
                    className="block rounded-2xl border border-slate-200 p-4 hover:bg-slate-50"
                  >
                    <p className="font-medium text-slate-900">
                      {listing.brand} {listing.model}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      {listing.nickname || "Standard release"}
                    </p>
                    <div className="mt-2 flex items-center justify-between text-sm text-slate-600">
                      <span>{listing.status}</span>
                      <span>${(listing.price_cents / 100).toFixed(2)}</span>
                    </div>
                  </a>
                ))
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold">Recent Sales</h2>

            <div className="mt-4 space-y-3">
              {recentSellerOrders.length === 0 ? (
                <p className="text-sm text-slate-500">No sales yet.</p>
              ) : (
                recentSellerOrders.map((order) => (
                  <a
                    key={order.id}
                    href={`/orders/${order.id}`}
                    className="block rounded-2xl border border-slate-200 p-4 hover:bg-slate-50"
                  >
                    <p className="font-medium text-slate-900">
                      Order #{order.id.slice(0, 8)}
                    </p>
                    <div className="mt-2 flex items-center justify-between text-sm text-slate-600">
                      <span>{order.status}</span>
                      <span>${(order.amount_cents / 100).toFixed(2)}</span>
                    </div>
                  </a>
                ))
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold">Recent Purchases</h2>

            <div className="mt-4 space-y-3">
              {recentBuyerOrders.length === 0 ? (
                <p className="text-sm text-slate-500">No purchases yet.</p>
              ) : (
                recentBuyerOrders.map((order) => (
                  <a
                    key={order.id}
                    href={`/orders/${order.id}`}
                    className="block rounded-2xl border border-slate-200 p-4 hover:bg-slate-50"
                  >
                    <p className="font-medium text-slate-900">
                      Order #{order.id.slice(0, 8)}
                    </p>
                    <div className="mt-2 flex items-center justify-between text-sm text-slate-600">
                      <span>{order.status}</span>
                      <span>${(order.amount_cents / 100).toFixed(2)}</span>
                    </div>
                  </a>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}