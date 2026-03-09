import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import SellerPayoutsButton from "@/app/components/enable-payouts-button";
import AdminModerationPanel from "@/app/components/admin-moderation-panel";

function formatCurrency(cents: number | null | undefined) {
  return `$${(((cents ?? 0) as number) / 100).toFixed(2)}`;
}

function formatDate(dateString: string | null | undefined) {
  if (!dateString) return "—";
  return new Date(dateString).toLocaleDateString();
}

function daysSince(dateString: string | null | undefined) {
  if (!dateString) return 0;
  const ms = Date.now() - new Date(dateString).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function humanizeStatus(status: string | null | undefined) {
  return (status ?? "unknown").replaceAll("_", " ");
}

function getAdminEmails() {
  return new Set(
    (process.env.RELAY_ADMIN_EMAILS ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean)
  );
}

function isCurrentlyBanned(profile: {
  banned_permanently?: boolean | null;
  banned_until?: string | null;
}) {
  if (profile.banned_permanently) return true;
  if (!profile.banned_until) return false;
  return new Date(profile.banned_until).getTime() > Date.now();
}

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
    .select(
      "id, username, bio, average_rating, total_reviews, total_sales, stripe_account_id, banned_until, banned_permanently, ban_reason"
    )
    .eq("id", user.id)
    .single();

  if (error || !profile) {
    redirect("/onboarding");
  }

  const isDefaultUsername = profile.username.startsWith("user_");
  if (isDefaultUsername) {
    redirect("/onboarding");
  }

  const adminEmails = getAdminEmails();
  const isAdmin = Boolean(user.email && adminEmails.has(user.email.toLowerCase()));

  if (!isAdmin) {
    const currentlyBanned = isCurrentlyBanned(profile);

    if (currentlyBanned) {
      return (
        <main className="min-h-screen bg-slate-50 px-6 py-12 text-slate-900">
          <div className="mx-auto max-w-2xl rounded-3xl border border-red-200 bg-white p-8 shadow-sm">
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-red-600">
              Relay
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">Account Restricted</h1>
            <p className="mt-4 text-slate-700">
              Your account is currently restricted from using Relay.
            </p>
            <p className="mt-3 text-sm text-slate-600">
              {profile.banned_permanently
                ? "This ban is permanent."
                : `Restricted until ${formatDate(profile.banned_until)}.`}
            </p>
            {profile.ban_reason && (
              <p className="mt-3 text-sm text-slate-600">
                Reason: {profile.ban_reason}
              </p>
            )}
          </div>
        </main>
      );
    }

    const [
      listingsResult,
      ordersResult,
      buyerOrdersResult,
      conversationsResult,
    ] = await Promise.all([
      supabase
        .from("listings")
        .select("id, brand, model, nickname, price_cents, status, created_at, admin_removed")
        .eq("seller_id", user.id)
        .order("created_at", { ascending: false }),

      supabase
        .from("orders")
        .select("id, status, listing_id, amount_cents, total_amount_cents, created_at")
        .eq("seller_id", user.id)
        .order("created_at", { ascending: false }),

      supabase
        .from("orders")
        .select("id, status, listing_id, amount_cents, total_amount_cents, created_at")
        .eq("buyer_id", user.id)
        .order("created_at", { ascending: false }),

      supabase
        .from("conversations")
        .select("id")
        .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`),
    ]);

    const listings = (listingsResult.data ?? []).filter((listing) => !listing.admin_removed);
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
      ["paid", "label_created", "shipped", "out_for_delivery", "delivered"].includes(
        order.status
      )
    ).length;

    const recentListings = listings.slice(0, 3);
    const recentSellerOrders = sellerOrders.slice(0, 3);
    const recentBuyerOrders = buyerOrders.slice(0, 3);

    const hasStripeAccount = Boolean(profile.stripe_account_id);

    return (
      <main className="min-h-screen bg-slate-50 px-6 py-12 text-slate-900">
        <div className="mx-auto max-w-6xl">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">
            Relay
          </p>

          <h1 className="mt-2 text-4xl font-bold tracking-tight">Dashboard</h1>

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
                  <p className="mt-2 text-2xl font-semibold">
                    {profile.average_rating}
                  </p>
                </div>

                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-sm text-slate-500">Reviews</p>
                  <p className="mt-2 text-2xl font-semibold">
                    {profile.total_reviews}
                  </p>
                </div>

                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-sm text-slate-500">Sold Listings</p>
                  <p className="mt-2 text-2xl font-semibold">
                    {soldListingsCount}
                  </p>
                </div>
              </div>

              <div className="mt-6">
                <p className="text-sm text-slate-500">
                  Payouts:{" "}
                  <span className="font-medium text-slate-900">
                    {profile.stripe_account_id ? "Enabled" : "Not enabled"}
                  </span>
                </p>
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

                <SellerPayoutsButton hasStripeAccount={hasStripeAccount} />
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
                        <span>{formatCurrency(listing.price_cents)}</span>
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
                        <span>
                          {formatCurrency(order.total_amount_cents ?? order.amount_cents)}
                        </span>
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
                        <span>
                          {formatCurrency(order.total_amount_cents ?? order.amount_cents)}
                        </span>
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

  const [
    profilesResult,
    listingsResult,
    ordersResult,
    reviewsCountResult,
    conversationsCountResult,
  ] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select(
        "id, username, total_sales, average_rating, created_at, stripe_account_id, banned_until, banned_permanently, ban_reason"
      ),
    supabaseAdmin
      .from("listings")
      .select(
        "id, seller_id, brand, model, nickname, price_cents, status, created_at, admin_removed, admin_removed_at, admin_removed_reason"
      )
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("orders")
      .select(
        "id, listing_id, buyer_id, seller_id, amount_cents, shipping_amount_cents, total_amount_cents, relay_fee_cents, status, created_at, tracking_code"
      )
      .order("created_at", { ascending: false }),
    supabaseAdmin.from("reviews").select("*", { count: "exact", head: true }),
    supabaseAdmin.from("conversations").select("*", { count: "exact", head: true }),
  ]);

  const profiles = profilesResult.data ?? [];
  const listings = listingsResult.data ?? [];
  const orders = ordersResult.data ?? [];

  const profilesById = new Map(
    profiles.map((entry) => [
      entry.id,
      {
        username: entry.username,
        total_sales: entry.total_sales ?? 0,
        average_rating: entry.average_rating ?? 0,
        created_at: entry.created_at,
        stripe_account_id: entry.stripe_account_id,
        banned_until: entry.banned_until,
        banned_permanently: entry.banned_permanently,
        ban_reason: entry.ban_reason,
      },
    ])
  );

  const visibleListings = listings.filter((listing) => !listing.admin_removed);
  const removedListings = listings.filter((listing) => listing.admin_removed);

  const totalUsers = profiles.length;
  const totalListings = visibleListings.length;
  const activeListings = visibleListings.filter((listing) => listing.status === "active").length;
  const soldListings = visibleListings.filter((listing) => listing.status === "sold").length;
  const totalOrders = orders.length;

  const gmvCents = orders.reduce((sum, order) => sum + (order.amount_cents ?? 0), 0);
  const shippingCollectedCents = orders.reduce(
    (sum, order) => sum + (order.shipping_amount_cents ?? 0),
    0
  );
  const relayRevenueCents = orders.reduce(
    (sum, order) => sum + (order.relay_fee_cents ?? 0),
    0
  );

  const newUsers30d = profiles.filter((entry) => daysSince(entry.created_at) <= 30).length;
  const newListings30d = visibleListings.filter((entry) => daysSince(entry.created_at) <= 30).length;
  const newOrders30d = orders.filter((entry) => daysSince(entry.created_at) <= 30).length;

  const activeSellerIds = new Set(
    visibleListings
      .filter((listing) => listing.status === "active")
      .map((listing) => listing.seller_id)
  );

  const sellerMetrics = new Map<
    string,
    {
      userId: string;
      username: string;
      salesCount: number;
      grossItemRevenueCents: number;
      relayFeesCents: number;
      banned: boolean;
      banReason: string | null;
    }
  >();

  for (const order of orders) {
    const sellerProfile = profilesById.get(order.seller_id);
    const sellerName = sellerProfile?.username || "unknown";

    if (!sellerMetrics.has(order.seller_id)) {
      sellerMetrics.set(order.seller_id, {
        userId: order.seller_id,
        username: sellerName,
        salesCount: 0,
        grossItemRevenueCents: 0,
        relayFeesCents: 0,
        banned: Boolean(
          sellerProfile &&
            isCurrentlyBanned({
              banned_permanently: sellerProfile.banned_permanently,
              banned_until: sellerProfile.banned_until,
            })
        ),
        banReason: sellerProfile?.ban_reason ?? null,
      });
    }

    const entry = sellerMetrics.get(order.seller_id)!;
    entry.salesCount += 1;
    entry.grossItemRevenueCents += order.amount_cents ?? 0;
    entry.relayFeesCents += order.relay_fee_cents ?? 0;
  }

  for (const entry of profiles) {
    if (!sellerMetrics.has(entry.id)) {
      sellerMetrics.set(entry.id, {
        userId: entry.id,
        username: entry.username,
        salesCount: 0,
        grossItemRevenueCents: 0,
        relayFeesCents: 0,
        banned: isCurrentlyBanned(entry),
        banReason: entry.ban_reason ?? null,
      });
    }
  }

  const topSellers = [...sellerMetrics.values()]
    .sort((a, b) => b.grossItemRevenueCents - a.grossItemRevenueCents)
    .slice(0, 5);

  const statusCounts = orders.reduce<Record<string, number>>((acc, order) => {
    const key = order.status || "unknown";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const shippingExceptions = orders.filter((order) => {
    const ageDays = daysSince(order.created_at);

    if (order.status === "label_created" && ageDays >= 3) return true;
    if (order.status === "shipped" && ageDays >= 10) return true;
    if (order.status === "out_for_delivery" && ageDays >= 3) return true;
    if (order.status === "delivered" && ageDays >= 2) return true;

    return false;
  });

  const deliveredAwaitingCompletion = orders.filter(
    (order) => order.status === "delivered"
  ).length;

  const recentOrders = orders.slice(0, 4);
  const recentListings = visibleListings.slice(0, 6);

  const sellersWithPayoutsEnabled = profiles.filter(
    (entry) => Boolean(entry.stripe_account_id)
  ).length;

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-12 text-slate-900">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">
              Relay Admin
            </p>
            <h1 className="mt-2 text-4xl font-bold tracking-tight">
              Marketplace Dashboard
            </h1>
            <p className="mt-3 text-slate-600">
              Monitor revenue, orders, sellers, and shipping health across Relay.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
            <p className="text-sm text-slate-500">Signed in as</p>
            <p className="mt-1 font-medium text-slate-900">@{profile.username}</p>
          </div>
        </div>

        <div className="mt-8 grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-medium text-slate-500">Marketplace GMV</p>
            <p className="mt-3 text-3xl font-bold tracking-tight">
              {formatCurrency(gmvCents)}
            </p>
            <p className="mt-2 text-sm text-slate-500">Item value only</p>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-medium text-slate-500">Relay Revenue</p>
            <p className="mt-3 text-3xl font-bold tracking-tight">
              {formatCurrency(relayRevenueCents)}
            </p>
            <p className="mt-2 text-sm text-slate-500">Platform fees collected</p>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-medium text-slate-500">Shipping Collected</p>
            <p className="mt-3 text-3xl font-bold tracking-tight">
              {formatCurrency(shippingCollectedCents)}
            </p>
            <p className="mt-2 text-sm text-slate-500">Buyer-paid shipping</p>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-medium text-slate-500">Open Exceptions</p>
            <p className="mt-3 text-3xl font-bold tracking-tight">
              {shippingExceptions.length}
            </p>
            <p className="mt-2 text-sm text-slate-500">Orders needing attention</p>
          </div>
        </div>

        <div className="mt-8 grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-medium text-slate-500">Users</p>
            <p className="mt-3 text-3xl font-bold tracking-tight">{totalUsers}</p>
            <p className="mt-2 text-sm text-slate-500">{newUsers30d} in last 30 days</p>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-medium text-slate-500">Orders</p>
            <p className="mt-3 text-3xl font-bold tracking-tight">{totalOrders}</p>
            <p className="mt-2 text-sm text-slate-500">{newOrders30d} in last 30 days</p>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-medium text-slate-500">Listings</p>
            <p className="mt-3 text-3xl font-bold tracking-tight">{totalListings}</p>
            <p className="mt-2 text-sm text-slate-500">
              {activeListings} active · {soldListings} sold · {newListings30d} new
            </p>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-medium text-slate-500">Sellers</p>
            <p className="mt-3 text-3xl font-bold tracking-tight">
              {activeSellerIds.size}
            </p>
            <p className="mt-2 text-sm text-slate-500">
              {sellersWithPayoutsEnabled} payouts enabled
            </p>
          </div>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-xl font-semibold">Order Status Breakdown</h2>
              <p className="text-sm text-slate-500">
                {deliveredAwaitingCompletion} delivered awaiting confirmation
              </p>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {[
                "paid",
                "label_created",
                "shipped",
                "out_for_delivery",
                "delivered",
                "completed",
                "cancelled",
                "refunded",
              ].map((status) => (
                <div
                  key={status}
                  className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                >
                  <p className="text-sm text-slate-500 capitalize">
                    {humanizeStatus(status)}
                  </p>
                  <p className="mt-2 text-2xl font-semibold">
                    {statusCounts[status] ?? 0}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-sm text-slate-500">Reviews</p>
                <p className="mt-2 text-2xl font-semibold">
                  {reviewsCountResult.count ?? 0}
                </p>
              </div>

              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-sm text-slate-500">Conversations</p>
                <p className="mt-2 text-2xl font-semibold">
                  {conversationsCountResult.count ?? 0}
                </p>
              </div>

              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-sm text-slate-500">Average Revenue / Order</p>
                <p className="mt-2 text-2xl font-semibold">
                  {formatCurrency(
                    totalOrders > 0 ? Math.round(relayRevenueCents / totalOrders) : 0
                  )}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold">Top Sellers</h2>

            <div className="mt-4 space-y-3">
              {topSellers.length === 0 ? (
                <p className="text-sm text-slate-500">No seller activity yet.</p>
              ) : (
                topSellers.map((seller, index) => (
                  <div
                    key={`${seller.userId}-${index}`}
                    className="rounded-2xl border border-slate-200 p-4"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <p className="font-medium text-slate-900">@{seller.username}</p>
                      <p className="text-sm text-slate-500">
                        {seller.salesCount} sale{seller.salesCount === 1 ? "" : "s"}
                      </p>
                    </div>

                    <div className="mt-3 flex items-center justify-between text-sm text-slate-600">
                      <span>GMV</span>
                      <span>{formatCurrency(seller.grossItemRevenueCents)}</span>
                    </div>

                    <div className="mt-1 flex items-center justify-between text-sm text-slate-600">
                      <span>Relay fees</span>
                      <span>{formatCurrency(seller.relayFeesCents)}</span>
                    </div>

                    {seller.banned && (
                      <p className="mt-2 text-sm font-medium text-red-600">
                        Banned{seller.banReason ? ` · ${seller.banReason}` : ""}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <AdminModerationPanel
          sellers={topSellers}
          visibleListings={recentListings}
          removedListings={removedListings.slice(0, 8)}
        />

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm h-[520px] flex flex-col">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-xl font-semibold">Recent Orders</h2>
              <Link
                href="/orders"
                className="text-sm font-medium text-slate-900 underline"
              >
                View all
              </Link>
            </div>

            <div className="mt-4 flex-1 overflow-y-auto pr-1 space-y-3">
              {recentOrders.length === 0 ? (
                <p className="text-sm text-slate-500">No orders yet.</p>
              ) : (
                recentOrders.map((order) => {
                  const buyerName = profilesById.get(order.buyer_id)?.username ?? "unknown";
                  const sellerName = profilesById.get(order.seller_id)?.username ?? "unknown";

                  return (
                    <Link
                      key={order.id}
                      href={`/orders/${order.id}`}
                      className="block rounded-2xl border border-slate-200 p-4 hover:bg-slate-50"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="font-medium text-slate-900">
                            Order #{order.id.slice(0, 8)}
                          </p>
                          <p className="mt-1 text-sm text-slate-500">
                            Buyer: @{buyerName} · Seller: @{sellerName}
                          </p>
                          <p className="mt-1 text-sm text-slate-500">
                            {humanizeStatus(order.status)}
                            {order.tracking_code ? ` · ${order.tracking_code}` : ""}
                          </p>
                        </div>

                        <div className="text-right">
                          <p className="font-semibold text-slate-900">
                            {formatCurrency(order.total_amount_cents ?? order.amount_cents)}
                          </p>
                          <p className="mt-1 text-sm text-slate-500">
                            {formatDate(order.created_at)}
                          </p>
                        </div>
                      </div>
                    </Link>
                  );
                })
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm h-[520px] flex flex-col">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-xl font-semibold">Shipping Exceptions</h2>
              <p className="text-sm text-slate-500">Operational watchlist</p>
            </div>

            <div className="mt-4 flex-1 overflow-y-auto pr-1 space-y-3">
              {shippingExceptions.length === 0 ? (
                <p className="text-sm text-slate-500">No exceptions right now.</p>
              ) : (
                shippingExceptions.slice(0, 8).map((order) => {
                  const sellerName = profilesById.get(order.seller_id)?.username ?? "unknown";

                  return (
                    <Link
                      key={order.id}
                      href={`/orders/${order.id}`}
                      className="block rounded-2xl border border-slate-200 p-4 hover:bg-slate-50"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="font-medium text-slate-900">
                            Order #{order.id.slice(0, 8)}
                          </p>
                          <p className="mt-1 text-sm text-slate-500">
                            Seller: @{sellerName}
                          </p>
                          <p className="mt-1 text-sm text-slate-500">
                            Status: {humanizeStatus(order.status)}
                          </p>
                        </div>

                        <p className="text-sm text-slate-500">
                          {daysSince(order.created_at)}d old
                        </p>
                      </div>
                    </Link>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}