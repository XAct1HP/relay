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
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  Seller Offer
                </h3>

                <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
                  ${(offer.amount_cents / 100).toFixed(2)}
                </p>

                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                    Status: {offer.status}
                  </span>

                  {offer.expires_at && (
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                      Expires: {new Date(offer.expires_at).toLocaleString()}
                    </span>
                  )}
                </div>

                {isExpired && isPending && (
                  <p className="mt-3 text-sm font-medium text-amber-600">
                    This offer has expired.
                  </p>
                )}
              </div>

              {isBuyer && isPending && !isExpired && (
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled={loadingOfferId === offer.id}
                    onClick={() => updateOfferStatus(offer.id, "accepted")}
                    className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                  >
                    {loadingOfferId === offer.id ? "Updating..." : "Accept Offer"}
                  </button>

                  <button
                    type="button"
                    disabled={loadingOfferId === offer.id}
                    onClick={() => updateOfferStatus(offer.id, "rejected")}
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100 disabled:opacity-50"
                  >
                    Decline
                  </button>
                </div>
              )}

              {isSeller && (
                <div className="text-sm text-slate-500">
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

      {message && <p className="text-sm text-slate-600">{message}</p>}
    </div>
  );
}