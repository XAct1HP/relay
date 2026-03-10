"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Offer = {
  id: string;
  conversation_id: string;
  listing_id: string;
  seller_id: string;
  buyer_id: string;
  amount_cents: number;
  status: string;
  expires_at: string | null;
  created_at: string;
};

type ConversationOffersProps = {
  offers: Offer[];
  currentUserId: string;
};

export default function ConversationOffers({
  offers,
  currentUserId,
}: ConversationOffersProps) {
  const supabase = createClient();
  const router = useRouter();
  const [loadingOfferId, setLoadingOfferId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function updateOfferStatus(offerId: string, newStatus: string) {
    setLoadingOfferId(offerId);
    setMessage("");

    const { error } = await supabase
      .from("offers")
      .update({ status: newStatus })
      .eq("id", offerId);

    if (error) {
      setMessage(error.message);
      setLoadingOfferId(null);
      return;
    }

    setLoadingOfferId(null);
    router.refresh();
  }

  function acceptOffer(offerId: string, listingId: string) {
    setLoadingOfferId(offerId);
    setMessage("");
    router.push(
      `/checkout/start/${listingId}?offerId=${encodeURIComponent(offerId)}`
    );
  }

  if (offers.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      {offers.map((offer) => {
        const isBuyer = currentUserId === offer.buyer_id;
        const isSeller = currentUserId === offer.seller_id;
        const isPending = offer.status === "pending";
        const isExpired =
          offer.expires_at && new Date(offer.expires_at).getTime() < Date.now();

        return (
          <div
            key={offer.id}
            className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-white/[0.05] shadow-[0_20px_60px_rgba(0,0,0,0.22)] backdrop-blur-xl"
          >
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 bg-black/20 px-5 py-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.2em] text-white/40">
                  Seller Offer
                </p>
                <p className="mt-2 text-3xl font-semibold tracking-tight text-white">
                  ${(offer.amount_cents / 100).toFixed(2)}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs font-medium text-white/70">
                  Status: {offer.status}
                </span>

                {offer.expires_at && (
                  <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs font-medium text-white/70">
                    Expires: {new Date(offer.expires_at).toLocaleString()}
                  </span>
                )}
              </div>
            </div>

            <div className="p-5">
              {isExpired && isPending && (
                <p className="text-sm font-medium text-amber-300/90">
                  This offer has expired.
                </p>
              )}

              {isBuyer && isPending && !isExpired && (
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled={loadingOfferId === offer.id}
                    onClick={() => acceptOffer(offer.id, offer.listing_id)}
                    className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-white/90 disabled:opacity-50"
                  >
                    {loadingOfferId === offer.id ? "Redirecting..." : "Accept Offer"}
                  </button>

                  <button
                    type="button"
                    disabled={loadingOfferId === offer.id}
                    onClick={() => updateOfferStatus(offer.id, "rejected")}
                    className="rounded-full border border-white/12 bg-white/[0.05] px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/[0.08] disabled:opacity-50"
                  >
                    Decline
                  </button>
                </div>
              )}

              {isSeller && (
                <div className="text-sm text-white/52">
                  {offer.status === "pending" && "Waiting for buyer response"}
                  {offer.status === "accepted" && "Buyer accepted this offer"}
                  {offer.status === "rejected" && "Buyer declined this offer"}
                  {offer.status === "expired" && "Offer expired"}
                  {offer.status === "cancelled" && "Offer cancelled"}
                </div>
              )}
            </div>
          </div>
        );
      })}

      {message && <p className="text-sm text-white/65">{message}</p>}
    </div>
  );
}