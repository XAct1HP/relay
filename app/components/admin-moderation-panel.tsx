"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Seller = {
  userId: string;
  username: string;
  salesCount: number;
  grossItemRevenueCents: number;
  relayFeesCents: number;
  banned: boolean;
  banReason: string | null;
};

type Listing = {
  id: string;
  seller_id: string;
  brand: string;
  model: string;
  nickname: string | null;
  price_cents: number;
  status: string;
  admin_removed?: boolean | null;
  admin_removed_reason?: string | null;
};

function formatCurrency(cents: number | null | undefined) {
  return `$${(((cents ?? 0) as number) / 100).toFixed(2)}`;
}

export default function AdminModerationPanel({
  sellers,
  visibleListings,
  removedListings,
}: {
  sellers: Seller[];
  visibleListings: Listing[];
  removedListings: Listing[];
}) {
  const router = useRouter();
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [sellerQuery, setSellerQuery] = useState("");
  const [listingQuery, setListingQuery] = useState("");

  const filteredSellers = useMemo(() => {
    const q = sellerQuery.trim().toLowerCase();
    if (!q) return sellers;

    return sellers.filter((seller) => {
      return (
        seller.username.toLowerCase().includes(q) ||
        seller.userId.toLowerCase().includes(q)
      );
    });
  }, [sellers, sellerQuery]);

  const filteredVisibleListings = useMemo(() => {
    const q = listingQuery.trim().toLowerCase();
    if (!q) return visibleListings;

    return visibleListings.filter((listing) => {
      const fullName =
        `${listing.brand} ${listing.model} ${listing.nickname ?? ""}`.toLowerCase();

      return (
        fullName.includes(q) ||
        listing.id.toLowerCase().includes(q) ||
        listing.status.toLowerCase().includes(q)
      );
    });
  }, [visibleListings, listingQuery]);

  const filteredRemovedListings = useMemo(() => {
    const q = listingQuery.trim().toLowerCase();
    if (!q) return removedListings;

    return removedListings.filter((listing) => {
      const fullName =
        `${listing.brand} ${listing.model} ${listing.nickname ?? ""}`.toLowerCase();

      return (
        fullName.includes(q) ||
        listing.id.toLowerCase().includes(q) ||
        (listing.admin_removed_reason ?? "").toLowerCase().includes(q)
      );
    });
  }, [removedListings, listingQuery]);

  async function banUser(
    targetUserId: string,
    mode: "temporary" | "permanent" | "clear",
    days?: number
  ) {
    setLoadingKey(`${targetUserId}-${mode}`);
    setMessage("");

    const res = await fetch("/api/admin/ban-user", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        targetUserId,
        mode,
        days,
        reason:
          mode === "temporary"
            ? "Admin temporary ban"
            : mode === "permanent"
            ? "Admin permanent ban"
            : null,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      setMessage(data.error || "Failed to update user moderation.");
      setLoadingKey(null);
      return;
    }

    setLoadingKey(null);
    router.refresh();
  }

  async function removeListing(listingId: string) {
    const confirmed = window.confirm(
      "Permanently remove this listing from the marketplace?"
    );

    if (!confirmed) return;

    setLoadingKey(`listing-${listingId}`);
    setMessage("");

    const res = await fetch("/api/admin/remove-listing", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        listingId,
        reason: "Removed by Relay admin",
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      setMessage(data.error || "Failed to remove listing.");
      setLoadingKey(null);
      return;
    }

    setLoadingKey(null);
    router.refresh();
  }

  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-2">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm h-[540px] flex flex-col">
        <h2 className="text-xl font-semibold">User Moderation</h2>
        <p className="mt-2 text-sm text-slate-500">
          Temporarily or permanently ban sellers from Relay.
        </p>

        <div className="mt-4">
          <input
            type="text"
            value={sellerQuery}
            onChange={(e) => setSellerQuery(e.target.value)}
            placeholder="Search users by username or ID"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
          />
        </div>

        <div className="mt-4 flex-1 overflow-y-auto pr-1 space-y-4">
          {filteredSellers.length === 0 ? (
            <p className="text-sm text-slate-500">No sellers found.</p>
          ) : (
            filteredSellers.map((seller) => (
              <div key={seller.userId} className="rounded-2xl border border-slate-200 p-4">
                <div>
                  <p className="font-medium text-slate-900">@{seller.username}</p>
                  <p className="mt-1 text-sm text-slate-500 break-all">
                    {seller.salesCount} sales · {formatCurrency(seller.grossItemRevenueCents)} GMV
                  </p>
                  {seller.banned && (
                    <p className="mt-2 text-sm font-medium text-red-600">
                      Currently banned{seller.banReason ? ` · ${seller.banReason}` : ""}
                    </p>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    onClick={() => banUser(seller.userId, "temporary", 7)}
                    disabled={loadingKey === `${seller.userId}-temporary`}
                    className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-50"
                  >
                    {loadingKey === `${seller.userId}-temporary` ? "Saving..." : "Temp Ban 7d"}
                  </button>

                  <button
                    onClick={() => banUser(seller.userId, "permanent")}
                    disabled={loadingKey === `${seller.userId}-permanent`}
                    className="rounded-lg border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    {loadingKey === `${seller.userId}-permanent` ? "Saving..." : "Permanent Ban"}
                  </button>

                  <button
                    onClick={() => banUser(seller.userId, "clear")}
                    disabled={loadingKey === `${seller.userId}-clear`}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100 disabled:opacity-50"
                  >
                    {loadingKey === `${seller.userId}-clear` ? "Saving..." : "Clear Ban"}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm h-[540px] flex flex-col">
        <h2 className="text-xl font-semibold">Listing Moderation</h2>
        <p className="mt-2 text-sm text-slate-500">
          Permanently remove listings from the marketplace.
        </p>

        <div className="mt-4">
          <input
            type="text"
            value={listingQuery}
            onChange={(e) => setListingQuery(e.target.value)}
            placeholder="Search listings by name, ID, or status"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
          />
        </div>

        <div className="mt-4 flex-1 overflow-y-auto pr-1">
          <div className="space-y-4">
            {filteredVisibleListings.length === 0 ? (
              <p className="text-sm text-slate-500">No active listings found.</p>
            ) : (
              filteredVisibleListings.map((listing) => (
                <div key={listing.id} className="rounded-2xl border border-slate-200 p-4">
                  <p className="font-medium text-slate-900">
                    {listing.brand} {listing.model}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    {listing.nickname || "Standard release"}
                  </p>
                  <p className="mt-2 text-sm text-slate-500 break-all">
                    {listing.status} · {formatCurrency(listing.price_cents)}
                  </p>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <a
                      href={`/listings/${listing.id}`}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100"
                    >
                      View
                    </a>

                    <button
                      onClick={() => removeListing(listing.id)}
                      disabled={loadingKey === `listing-${listing.id}`}
                      className="rounded-lg border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      {loadingKey === `listing-${listing.id}` ? "Removing..." : "Remove Permanently"}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <details className="mt-6 rounded-2xl border border-slate-200 p-4">
            <summary className="cursor-pointer text-sm font-medium text-slate-900">
              See removed listings
            </summary>

            <div className="mt-4 space-y-3">
              {filteredRemovedListings.length === 0 ? (
                <p className="text-sm text-slate-500">No removed listings.</p>
              ) : (
                filteredRemovedListings.map((listing) => (
                  <div
                    key={listing.id}
                    className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                  >
                    <p className="font-medium text-slate-900">
                      {listing.brand} {listing.model}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      {listing.nickname || "Standard release"}
                    </p>
                    <p className="mt-2 text-sm text-slate-500">
                      Removed from marketplace
                    </p>
                    {listing.admin_removed_reason && (
                      <p className="mt-1 text-sm text-slate-500">
                        Reason: {listing.admin_removed_reason}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          </details>
        </div>

        {message && <p className="mt-4 text-sm text-slate-600">{message}</p>}
      </div>
    </div>
  );
}