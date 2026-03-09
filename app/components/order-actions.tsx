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
    <div className="mt-6">
      <div className="flex flex-wrap gap-4">
        {isSeller && status === "paid" && (
          <button
            onClick={buyLabel}
            disabled={loading}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {loading ? "Generating..." : "Generate Shipping Label"}
          </button>
        )}

        {isSeller && shippingLabelUrl && (
          <a
            href={shippingLabelUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100"
          >
            Download Label
          </a>
        )}

        {isBuyer && status === "delivered" && (
          <button
            onClick={markCompleted}
            disabled={loading}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {loading ? "Updating..." : "Mark as Received"}
          </button>
        )}
      </div>

      {trackingCode && (
        <p className="mt-3 text-sm text-slate-600">Tracking: {trackingCode}</p>
      )}

      {message && <p className="mt-3 text-sm text-slate-600">{message}</p>}
    </div>
  );
}