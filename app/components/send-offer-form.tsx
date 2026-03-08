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

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
    >
      <h3 className="text-lg font-semibold text-slate-900">Send Offer</h3>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Offer Amount (USD)
          </label>
          <input
            type="number"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="285.00"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
            required
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Expires In (hours)
          </label>
          <select
            value={expiresInHours}
            onChange={(e) => setExpiresInHours(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
          >
            <option value="1">1 hour</option>
            <option value="6">6 hours</option>
            <option value="12">12 hours</option>
            <option value="24">24 hours</option>
            <option value="48">48 hours</option>
          </select>
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {loading ? "Sending..." : "Send Offer"}
      </button>

      {message && <p className="mt-3 text-sm text-slate-600">{message}</p>}
    </form>
  );
}