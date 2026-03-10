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

  const searchInputClassName =
    "w-full rounded-2xl border border-white/10 bg-[#0f1117] px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/28 focus:border-white/20 focus:bg-[#151922]";

  const secondaryButtonClassName =
    "rounded-full border border-white/12 bg-white/[0.05] px-4 py-2 text-sm font-semibold text-white transition hover:border-white/20 hover:bg-white/[0.08] disabled:opacity-50";

  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-2">
      <div className="flex h-[540px] flex-col rounded-[2rem] border border-white/10 bg-white/[0.05] p-6 shadow-[0_24px_70px_rgba(0,0,0,0.22)] backdrop-blur-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-white/38">
              Admin moderation
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-white">User Moderation</h2>
            <p className="mt-2 text-sm leading-7 text-white/58">
              Temporarily or permanently restrict sellers from Relay.
            </p>
          </div>

          <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-medium text-white/58">
            Sellers
          </div>
        </div>

        <div className="mt-5">
          <input
            type="text"
            value={sellerQuery}
            onChange={(e) => setSellerQuery(e.target.value)}
            placeholder="Search users by username or ID"
            className={searchInputClassName}
          />
        </div>

        <div className="mt-5 flex-1 space-y-4 overflow-y-auto pr-1">
          {filteredSellers.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/55">
              No sellers found.
            </div>
          ) : (
            filteredSellers.map((seller) => (
              <div
                key={seller.userId}
                className="rounded-[1.5rem] border border-white/10 bg-black/20 p-4"
              >
                <div>
                  <p className="font-semibold text-white">@{seller.username}</p>
                  <p className="mt-2 text-sm text-white/56 break-all">
                    {seller.salesCount} sales · {formatCurrency(seller.grossItemRevenueCents)} GMV
                  </p>
                  <p className="mt-1 text-sm text-white/45">
                    Relay fees: {formatCurrency(seller.relayFeesCents)}
                  </p>

                  {seller.banned && (
                    <div className="mt-3 rounded-2xl border border-red-400/20 bg-red-400/[0.08] px-3 py-2 text-sm font-medium text-red-200">
                      Currently banned
                      {seller.banReason ? ` · ${seller.banReason}` : ""}
                    </div>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    onClick={() => banUser(seller.userId, "temporary", 7)}
                    disabled={loadingKey === `${seller.userId}-temporary`}
                    className="rounded-full border border-amber-300/20 bg-amber-300/[0.10] px-4 py-2 text-sm font-semibold text-amber-200 transition hover:bg-amber-300/[0.16] disabled:opacity-50"
                  >
                    {loadingKey === `${seller.userId}-temporary` ? "Saving..." : "Temp Ban 7d"}
                  </button>

                  <button
                    onClick={() => banUser(seller.userId, "permanent")}
                    disabled={loadingKey === `${seller.userId}-permanent`}
                    className="rounded-full border border-red-300/20 bg-red-300/[0.10] px-4 py-2 text-sm font-semibold text-red-200 transition hover:bg-red-300/[0.16] disabled:opacity-50"
                  >
                    {loadingKey === `${seller.userId}-permanent` ? "Saving..." : "Permanent Ban"}
                  </button>

                  <button
                    onClick={() => banUser(seller.userId, "clear")}
                    disabled={loadingKey === `${seller.userId}-clear`}
                    className={secondaryButtonClassName}
                  >
                    {loadingKey === `${seller.userId}-clear` ? "Saving..." : "Clear Ban"}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="flex h-[540px] flex-col rounded-[2rem] border border-white/10 bg-white/[0.05] p-6 shadow-[0_24px_70px_rgba(0,0,0,0.22)] backdrop-blur-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-white/38">
              Admin moderation
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Listing Moderation</h2>
            <p className="mt-2 text-sm leading-7 text-white/58">
              Permanently remove listings from the marketplace when needed.
            </p>
          </div>

          <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-medium text-white/58">
            Listings
          </div>
        </div>

        <div className="mt-5">
          <input
            type="text"
            value={listingQuery}
            onChange={(e) => setListingQuery(e.target.value)}
            placeholder="Search listings by name, ID, or status"
            className={searchInputClassName}
          />
        </div>

        <div className="mt-5 flex-1 overflow-y-auto pr-1">
          <div className="space-y-4">
            {filteredVisibleListings.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/55">
                No active listings found.
              </div>
            ) : (
              filteredVisibleListings.map((listing) => (
                <div
                  key={listing.id}
                  className="rounded-[1.5rem] border border-white/10 bg-black/20 p-4"
                >
                  <p className="font-semibold text-white">
                    {listing.brand} {listing.model}
                  </p>
                  <p className="mt-1 text-sm text-white/55">
                    {listing.nickname || "Standard release"}
                  </p>
                  <p className="mt-2 text-sm text-white/45 break-all">
                    {listing.status} · {formatCurrency(listing.price_cents)}
                  </p>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <a
                      href={`/listings/${listing.id}`}
                      className={secondaryButtonClassName}
                    >
                      View
                    </a>

                    <button
                      onClick={() => removeListing(listing.id)}
                      disabled={loadingKey === `listing-${listing.id}`}
                      className="rounded-full border border-red-300/20 bg-red-300/[0.10] px-4 py-2 text-sm font-semibold text-red-200 transition hover:bg-red-300/[0.16] disabled:opacity-50"
                    >
                      {loadingKey === `listing-${listing.id}` ? "Removing..." : "Remove Permanently"}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <details className="mt-6 overflow-hidden rounded-[1.5rem] border border-white/10 bg-white/[0.03]">
            <summary className="cursor-pointer list-none px-4 py-4 text-sm font-semibold text-white">
              <span className="inline-flex items-center gap-2">
                <span className="text-white/75">Removed listings</span>
                <span className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[11px] text-white/55">
                  {filteredRemovedListings.length}
                </span>
              </span>
            </summary>

            <div className="border-t border-white/10 px-4 py-4">
              <div className="space-y-3">
                {filteredRemovedListings.length === 0 ? (
                  <p className="text-sm text-white/55">No removed listings.</p>
                ) : (
                  filteredRemovedListings.map((listing) => (
                    <div
                      key={listing.id}
                      className="rounded-2xl border border-white/10 bg-black/20 p-4"
                    >
                      <p className="font-semibold text-white">
                        {listing.brand} {listing.model}
                      </p>
                      <p className="mt-1 text-sm text-white/55">
                        {listing.nickname || "Standard release"}
                      </p>
                      <p className="mt-2 text-sm text-white/45">
                        Removed from marketplace
                      </p>
                      {listing.admin_removed_reason && (
                        <p className="mt-1 text-sm text-white/55">
                          Reason: {listing.admin_removed_reason}
                        </p>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </details>
        </div>

        {message && (
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3 text-sm text-white/70">
            {message}
          </div>
        )}
      </div>
    </div>
  );
}