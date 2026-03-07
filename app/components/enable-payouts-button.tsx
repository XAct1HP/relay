"use client";

import { useState } from "react";

type SellerPayoutsButtonProps = {
  hasStripeAccount: boolean;
};

export default function SellerPayoutsButton({
  hasStripeAccount,
}: SellerPayoutsButtonProps) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function handleClick() {
    setLoading(true);
    setMessage("");

    try {
      const res = await fetch("/api/stripe/connect", {
        method: "POST",
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage(data.error || "Failed to open Stripe payouts.");
        setLoading(false);
        return;
      }

      if (data.url) {
        window.location.href = data.url;
        return;
      }

      setMessage("No Stripe URL was returned.");
      setLoading(false);
    } catch {
      setMessage("Something went wrong.");
      setLoading(false);
    }
  }

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="w-full rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
      >
        {loading
          ? "Redirecting..."
          : hasStripeAccount
            ? "Manage Seller Payouts"
            : "Enable Seller Payouts"}
      </button>

      {message && <p className="mt-2 text-sm text-slate-600">{message}</p>}
    </div>
  );
}