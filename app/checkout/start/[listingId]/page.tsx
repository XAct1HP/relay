"use client";

import { FormEvent, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";

type QuoteResponse = {
  shippingAmountCents: number;
  carrier: string;
  service: string;
};

export default function CheckoutStartPage() {
  const params = useParams<{ listingId: string }>();
  const searchParams = useSearchParams();

  const listingId = params.listingId;
  const offerId = searchParams.get("offerId");

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

  const address = useMemo(
    () => ({
      name,
      phone,
      street1,
      street2,
      city,
      state,
      zip,
      country: "US",
    }),
    [name, phone, street1, street2, city, state, zip]
  );

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

    const body: Record<string, unknown> = {
      shippingAddress: address,
    };

    if (offerId) {
      body.offerId = offerId;
    } else {
      body.listingId = listingId;
    }

    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
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

  const inputClassName =
    "w-full rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-3 text-white outline-none transition placeholder:text-white/30 focus:border-white/20 focus:bg-white/[0.06]";

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#06070b] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.12),transparent_24%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.05),transparent_24%)]" />
      <div className="absolute inset-0 bg-[#06070b]/80" />

      <div className="relative mx-auto max-w-6xl px-6 py-12">
        <div className="mb-10 max-w-3xl">
          <div className="inline-flex items-center rounded-full border border-white/12 bg-white/[0.04] px-4 py-2 text-[11px] font-medium uppercase tracking-[0.24em] text-white/68 backdrop-blur">
            Relay Checkout
          </div>

          <h1 className="mt-6 text-4xl font-semibold tracking-[-0.04em] text-white sm:text-5xl">
            Enter your shipping details.
          </h1>

          <p className="mt-4 max-w-2xl text-sm leading-7 text-white/60 sm:text-base">
            We’ll estimate the prepaid label first, then send you to payment.
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr]">
          <form
            onSubmit={getQuote}
            className="rounded-[2rem] border border-white/10 bg-white/[0.05] p-6 shadow-[0_30px_100px_rgba(0,0,0,0.42)] backdrop-blur-2xl sm:p-8"
          >
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-white/38">
                  Delivery address
                </p>
                <p className="mt-2 text-xl font-semibold text-white">
                  Buyer shipping info
                </p>
              </div>

              {offerId && (
                <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-medium text-white/60">
                  Accepted offer
                </div>
              )}
            </div>

            <div className="space-y-4">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Full name"
                className={inputClassName}
                required
              />
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Phone (optional)"
                className={inputClassName}
              />
              <input
                value={street1}
                onChange={(e) => setStreet1(e.target.value)}
                placeholder="Street address"
                className={inputClassName}
                required
              />
              <input
                value={street2}
                onChange={(e) => setStreet2(e.target.value)}
                placeholder="Apt / unit (optional)"
                className={inputClassName}
              />

              <div className="grid gap-4 sm:grid-cols-3">
                <input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="City"
                  className={inputClassName}
                  required
                />
                <input
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  placeholder="State"
                  className={inputClassName}
                  required
                />
                <input
                  value={zip}
                  onChange={(e) => setZip(e.target.value)}
                  placeholder="ZIP"
                  className={inputClassName}
                  required
                />
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={loadingQuote}
                className="inline-flex items-center justify-center rounded-full bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loadingQuote ? "Getting quote..." : "Get shipping quote"}
              </button>

              {quote && (
                <button
                  type="button"
                  onClick={continueToPayment}
                  disabled={loadingCheckout}
                  className="inline-flex items-center justify-center rounded-full border border-white/12 bg-white/[0.05] px-5 py-3 text-sm font-semibold text-white transition hover:border-white/20 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loadingCheckout ? "Redirecting..." : "Continue to payment"}
                </button>
              )}
            </div>

            {message && (
              <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3 text-sm text-white/70">
                {message}
              </div>
            )}
          </form>

          <div className="space-y-5">
            <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 backdrop-blur-xl">
              <p className="text-xs uppercase tracking-[0.22em] text-white/38">
                Step flow
              </p>
              <div className="mt-5 space-y-4">
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <p className="text-sm font-semibold text-white">1. Enter address</p>
                  <p className="mt-1 text-sm text-white/55">
                    Add the destination for the buyer-paid label.
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <p className="text-sm font-semibold text-white">2. Quote shipping</p>
                  <p className="mt-1 text-sm text-white/55">
                    Relay calculates the cheapest prepaid option.
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <p className="text-sm font-semibold text-white">3. Complete payment</p>
                  <p className="mt-1 text-sm text-white/55">
                    You’ll be redirected to finish checkout.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 backdrop-blur-xl">
              <p className="text-xs uppercase tracking-[0.22em] text-white/38">
                Shipping estimate
              </p>

              {quote ? (
                <div className="mt-4">
                  <p className="text-4xl font-semibold tracking-tight text-white">
                    ${((quote.shippingAmountCents + 150) / 100).toFixed(2)}
                  </p>
                  <p className="mt-3 text-sm text-white/58">
                    Lowest available label found through {quote.carrier} · {quote.service}
                  </p>
                </div>
              ) : (
                <p className="mt-4 text-sm leading-7 text-white/55">
                  Your shipping estimate will appear here once you request a quote.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}