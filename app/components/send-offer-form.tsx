"use client";

import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type SendOfferFormProps = {
  conversationId: string;
  listingId: string;
  sellerId: string;
  buyerId: string;
};

export default function SendOfferForm({
  conversationId,
  listingId,
  sellerId,
  buyerId,
}: SendOfferFormProps) {
  const supabase = createClient();

  const [amount, setAmount] = useState("");
  const [expiresInHours, setExpiresInHours] = useState("24");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    const parsedAmount = Math.round(Number(amount) * 100);
    const parsedHours = Number(expiresInHours);

    if (!parsedAmount || parsedAmount <= 0) {
      setMessage("Enter a valid offer amount.");
      setLoading(false);
      return;
    }

    if (!parsedHours || parsedHours <= 0) {
      setMessage("Enter a valid expiration window.");
      setLoading(false);
      return;
    }

    const expiresAt = new Date(
      Date.now() + parsedHours * 60 * 60 * 1000
    ).toISOString();

    const { error } = await supabase.from("offers").insert({
      conversation_id: conversationId,
      listing_id: listingId,
      seller_id: sellerId,
      buyer_id: buyerId,
      amount_cents: parsedAmount,
      status: "pending",
      expires_at: expiresAt,
    });

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    setAmount("");
    setExpiresInHours("24");
    setMessage("Offer sent successfully.");
    setLoading(false);
  }

  const inputClassName =
    "w-full rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-3 text-white outline-none transition placeholder:text-white/30 focus:border-white/20 focus:bg-white/[0.06]";
  const selectClassName =
    "w-full appearance-none rounded-2xl border border-white/10 bg-[#0f1117] px-4 py-3 text-white outline-none transition focus:border-white/20 focus:bg-[#151922]";
  const labelClassName = "mb-2 block text-sm font-medium text-white/72";

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-[1.75rem] border border-white/10 bg-white/[0.05] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.22)] backdrop-blur-xl"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-white/38">
            Seller tools
          </p>
          <h3 className="mt-2 text-xl font-semibold text-white">Send offer</h3>
        </div>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClassName}>Offer Amount (USD)</label>
          <input
            type="number"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="285.00"
            className={inputClassName}
            required
          />
        </div>

        <div>
          <label className={labelClassName}>Expires In (hours)</label>
          <select
            value={expiresInHours}
            onChange={(e) => setExpiresInHours(e.target.value)}
            className={selectClassName}
          >
            <option value="1" className="bg-[#0f1117] text-white">1 hour</option>
            <option value="6" className="bg-[#0f1117] text-white">6 hours</option>
            <option value="12" className="bg-[#0f1117] text-white">12 hours</option>
            <option value="24" className="bg-[#0f1117] text-white">24 hours</option>
            <option value="48" className="bg-[#0f1117] text-white">48 hours</option>
          </select>
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="mt-5 rounded-full bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-white/90 disabled:opacity-50"
      >
        {loading ? "Sending..." : "Send Offer"}
      </button>

      {message && <p className="mt-3 text-sm text-white/65">{message}</p>}
    </form>
  );
}