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
  priceCents,
  status,
}: BuyNowButtonProps) {
  const supabase = createClient();
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const isAvailable = status === "active";

  async function handleBuy() {
    if (loading || !isAvailable) return;

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

    router.push(`/checkout/start/${listingId}`);
  }

  return (
    <div className="w-full sm:w-auto">
      <button
        type="button"
        onClick={handleBuy}
        disabled={loading || !isAvailable}
        className={`inline-flex min-h-12 w-full items-center justify-center rounded-full px-5 py-3 text-sm font-semibold transition sm:min-w-[170px] ${
          isAvailable
            ? "bg-white text-black hover:bg-white/90"
            : "cursor-not-allowed border border-white/10 bg-white/[0.05] text-white/45"
        } disabled:opacity-100`}
      >
        {loading
          ? "Redirecting..."
          : isAvailable
            ? `Buy Now · $${(priceCents / 100).toFixed(2)}`
            : "Unavailable"}
      </button>

      {message && (
        <p className="mt-3 text-sm text-white/65 sm:max-w-[260px]">{message}</p>
      )}
    </div>
  );
}