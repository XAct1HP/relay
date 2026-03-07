"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useState } from "react";

type BuyNowButtonProps = {
  listingId: string;
  sellerId: string;
  priceCents: number;
  status: string;
};

export default function BuyNowButton({
  listingId,
  sellerId,
  status,
}: BuyNowButtonProps) {
  const supabase = createClient();
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function handleBuy() {
    setLoading(true);
    setMessage("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push("/auth/login");
      return;
    }

    if (user.id === sellerId) {
      setMessage("You cannot buy your own listing.");
      setLoading(false);
      return;
    }

    if (status !== "active") {
      setMessage("This listing is no longer available.");
      setLoading(false);
      return;
    }

    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ listingId }),
    });

    const data = await res.json();

    if (!res.ok) {
      setMessage(data.error || "Failed to start checkout.");
      setLoading(false);
      return;
    }

    if (data.url) {
      window.location.href = data.url;
      return;
    }

    setMessage("Checkout URL was not returned.");
    setLoading(false);
  }

  return (
    <div>
      <button
        onClick={handleBuy}
        disabled={loading || status !== "active"}
        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {loading ? "Redirecting..." : status === "active" ? "Buy Now" : "Unavailable"}
      </button>

      {message && <p className="mt-3 text-sm text-slate-600">{message}</p>}
    </div>
  );
}