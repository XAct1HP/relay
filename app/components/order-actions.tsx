"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

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

  const [loading, setLoading] = useState<"label" | "complete" | null>(null);
  const [message, setMessage] = useState("");

  const isSeller = currentUserId === sellerId;
  const isBuyer = currentUserId === buyerId;

  async function buyLabel() {
    setLoading("label");
    setMessage("");

    const res = await fetch(`/api/orders/${orderId}/purchase-label`, {
      method: "POST",
    });

    const data = await res.json();

    if (!res.ok) {
      setMessage(data.error || "Failed to generate label.");
      setLoading(null);
      return;
    }

    setLoading(null);
    router.refresh();
  }

  async function markCompleted() {
    setLoading("complete");
    setMessage("");

    const { error } = await supabase
      .from("orders")
      .update({ status: "completed" })
      .eq("id", orderId);

    if (error) {
      setMessage(error.message);
      setLoading(null);
      return;
    }

    setLoading(null);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {isSeller && status === "paid" && (
        <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.03] p-4 sm:p-5">
          <p className="text-sm font-medium text-white">Generate shipping label</p>
          <p className="mt-2 text-sm leading-7 text-white/55">
            Purchase the prepaid label so the order can move into fulfillment.
          </p>

          <button
            onClick={buyLabel}
            disabled={loading !== null}
            className="mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-white/90 disabled:opacity-50"
          >
            {loading === "label" ? "Generating label..." : "Generate Shipping Label"}
          </button>
        </div>
      )}

      {isSeller && shippingLabelUrl && (
        <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.03] p-4 sm:p-5">
          <p className="text-sm font-medium text-white">Shipping label ready</p>
          <p className="mt-2 text-sm leading-7 text-white/55">
            Your label has been generated. Download it and attach it to the package.
          </p>

          <a
            href={shippingLabelUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-full border border-white/12 bg-white/[0.05] px-4 py-3 text-sm font-semibold text-white transition hover:border-white/20 hover:bg-white/[0.08]"
          >
            Download Label
          </a>
        </div>
      )}

      {isBuyer && status === "delivered" && (
        <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.03] p-4 sm:p-5">
          <p className="text-sm font-medium text-white">Confirm delivery</p>
          <p className="mt-2 text-sm leading-7 text-white/55">
            Mark the order as received once the package arrives and everything looks good.
          </p>

          <button
            onClick={markCompleted}
            disabled={loading !== null}
            className="mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-white/90 disabled:opacity-50"
          >
            {loading === "complete" ? "Updating..." : "Mark as Received"}
          </button>
        </div>
      )}

      {trackingCode && (
        <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.03] p-4 sm:p-5">
          <p className="text-sm text-white/50">Tracking Code</p>
          <p className="mt-2 break-all text-sm font-medium text-white">{trackingCode}</p>
        </div>
      )}

      {!isSeller && !isBuyer && (
        <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.03] p-4 text-sm text-white/55">
          No actions available for this order.
        </div>
      )}

      {message && (
        <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/70">
          {message}
        </div>
      )}
    </div>
  );
}