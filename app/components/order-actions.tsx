"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useState } from "react";

type OrderActionsProps = {
  orderId: string;
  listingId: string;
  currentUserId: string;
  buyerId: string;
  sellerId: string;
  status: string;
  shippingLabelUrl?: string | null;
  trackingCode?: string | null;
};

export default function OrderActions({
  orderId,
  currentUserId,
  buyerId,
  sellerId,
  status,
  shippingLabelUrl,
  trackingCode,
}: OrderActionsProps) {
  const supabase = createClient();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const isSeller = currentUserId === sellerId;
  const isBuyer = currentUserId === buyerId;

  async function buyLabel() {
    setLoading(true);
    setMessage("");

    const res = await fetch(`/api/orders/${orderId}/purchase-label`, {
      method: "POST",
    });

    const data = await res.json();

    if (!res.ok) {
      setMessage(data.error || "Failed to generate label.");
      setLoading(false);
      return;
    }

    setLoading(false);
    router.refresh();
  }

  async function markCompleted() {
    setLoading(true);
    setMessage("");

    const { error } = await supabase
      .from("orders")
      .update({ status: "completed" })
      .eq("id", orderId);

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    setLoading(false);
    router.refresh();
  }

  return (
    <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-5">
      <div className="flex flex-wrap gap-3">
        {isSeller && status === "paid" && (
          <button
            onClick={buyLabel}
            disabled={loading}
            className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-white/90 disabled:opacity-50"
          >
            {loading ? "Generating..." : "Generate Shipping Label"}
          </button>
        )}

        {isSeller && shippingLabelUrl && (
          <a
            href={shippingLabelUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-white/12 bg-white/[0.05] px-4 py-2 text-sm font-semibold text-white transition hover:border-white/20 hover:bg-white/[0.08]"
          >
            Download Label
          </a>
        )}

        {isBuyer && status === "delivered" && (
          <button
            onClick={markCompleted}
            disabled={loading}
            className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-white/90 disabled:opacity-50"
          >
            {loading ? "Updating..." : "Mark as Received"}
          </button>
        )}
      </div>

      {trackingCode && (
        <p className="mt-4 text-sm text-white/60">Tracking: {trackingCode}</p>
      )}

      {message && <p className="mt-3 text-sm text-white/65">{message}</p>}
    </div>
  );
}