"use client";

import { FormEvent, useState } from "react";
import { useParams } from "next/navigation";

type QuoteResponse = {
  shippingAmountCents: number;
  carrier: string;
  service: string;
};

export default function CheckoutStartPage() {
  const params = useParams<{ listingId: string }>();
  const listingId = params.listingId;

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [street1, setStreet1] = useState("");
  const [street2, setStreet2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [loadingCheckout, setLoadingCheckout] = useState(false);
  const [message, setMessage] = useState("");
  const [quote, setQuote] = useState<QuoteResponse | null>(null);

  const address = {
    name,
    phone,
    street1,
    street2,
    city,
    state,
    zip,
    country: "US",
  };

  async function getQuote(e?: FormEvent) {
    e?.preventDefault();
    setLoadingQuote(true);
    setMessage("");
    setQuote(null);

    const res = await fetch("/api/shipping/quote", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ listingId, shippingAddress: address }),
    });

    const data = await res.json();

    if (!res.ok) {
      setMessage(data.error || "Failed to quote shipping.");
      setLoadingQuote(false);
      return;
    }

    setQuote(data);
    setLoadingQuote(false);
  }

  async function continueToPayment() {
    setLoadingCheckout(true);
    setMessage("");

    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ listingId, shippingAddress: address }),
    });

    const data = await res.json();

    if (!res.ok) {
      setMessage(data.error || "Failed to start checkout.");
      setLoadingCheckout(false);
      return;
    }

    if (data.url) {
      window.location.href = data.url;
      return;
    }

    setMessage("Checkout URL was not returned.");
    setLoadingCheckout(false);
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-12 text-slate-900">
      <div className="mx-auto max-w-2xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">
          Relay
        </p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight">Shipping</h1>
        <p className="mt-3 text-slate-600">
          Enter your shipping address to get your prepaid label cost.
        </p>

        <form onSubmit={getQuote} className="mt-8 space-y-4">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Full name"
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            required
          />
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Phone (optional)"
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
          />
          <input
            value={street1}
            onChange={(e) => setStreet1(e.target.value)}
            placeholder="Street address"
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            required
          />
          <input
            value={street2}
            onChange={(e) => setStreet2(e.target.value)}
            placeholder="Apt / unit (optional)"
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
          />

          <div className="grid gap-4 sm:grid-cols-3">
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="City"
              className="rounded-lg border border-slate-300 px-3 py-2"
              required
            />
            <input
              value={state}
              onChange={(e) => setState(e.target.value)}
              placeholder="State"
              className="rounded-lg border border-slate-300 px-3 py-2"
              required
            />
            <input
              value={zip}
              onChange={(e) => setZip(e.target.value)}
              placeholder="ZIP"
              className="rounded-lg border border-slate-300 px-3 py-2"
              required
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={loadingQuote}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {loadingQuote ? "Quoting..." : "Get Shipping Quote"}
            </button>

            {quote && (
              <button
                type="button"
                onClick={continueToPayment}
                disabled={loadingCheckout}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100 disabled:opacity-50"
              >
                {loadingCheckout ? "Redirecting..." : "Continue to Payment"}
              </button>
            )}
          </div>

          {quote && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm text-slate-600">
                Estimated shipping:{" "}
                <span className="font-semibold">
                  ${(quote.shippingAmountCents / 100).toFixed(2)}
                </span>
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Cheapest rate: {quote.carrier} · {quote.service}
              </p>
            </div>
          )}

          {message && <p className="text-sm text-slate-600">{message}</p>}
        </form>
      </div>
    </main>
  );
}