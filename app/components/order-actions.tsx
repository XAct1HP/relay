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
};

export default function OrderActions({
  orderId,
  listingId,
  currentUserId,
  buyerId,
  sellerId,
  status,
}: OrderActionsProps) {
  const supabase = createClient();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const isSeller = currentUserId === sellerId;
  const isBuyer = currentUserId === buyerId;

  async function markShipped() {
    setLoading(true);
    setMessage("");

    const { error } = await supabase
      .from("orders")
      .update({ status: "shipped" })
      .eq("id", orderId);

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    setLoading(false);
    router.refresh();
  }

  async function markDelivered() {
    setLoading(true);
    setMessage("");

    const { error: orderError } = await supabase
      .from("orders")
      .update({ status: "completed" })
      .eq("id", orderId);

    if (orderError) {
      setMessage(orderError.message);
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
            onClick={markShipped}
            disabled={loading}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {loading ? "Updating..." : "Mark as Shipped"}
          </button>
        )}

        {isBuyer && status === "shipped" && (
          <button
            onClick={markDelivered}
            disabled={loading}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {loading ? "Updating..." : "Mark as Delivered"}
          </button>
        )}
      </div>

      {message && <p className="mt-3 text-sm text-slate-600">{message}</p>}
    </div>
  );
}