"use client";

import { FormEvent, useState } from "react";

type Props = {
  initialEnabled: boolean;
  initialMessage: string;
};

export default function AdminMarketplaceControls({
  initialEnabled,
  initialMessage,
}: Props) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [message, setMessage] = useState(initialMessage);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setStatus("");

    const res = await fetch("/api/admin/marketplace-settings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        enabled,
        disabledMessage: message,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      setStatus(data.error || "Failed to save marketplace settings.");
      setLoading(false);
      return;
    }

    setStatus("Marketplace settings updated.");
    setLoading(false);
  }

  return (
    <form className="relay-card p-6" onSubmit={handleSubmit}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-white/55">Marketplace Controls</p>
          <p className="mt-2 text-sm text-white/50">
            Disable marketplace browsing and display a custom message instead of listings.
          </p>
        </div>

        <div
          className={`rounded-full border px-3 py-1 text-xs font-semibold ${
            enabled
              ? "border-emerald-400/20 bg-emerald-400/[0.12] text-emerald-200"
              : "border-red-400/20 bg-red-400/[0.12] text-red-200"
          }`}
        >
          {enabled ? "Enabled" : "Disabled"}
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div>
          <p className="font-medium text-white">Marketplace visible</p>
          <p className="mt-1 text-sm text-white/50">
            Turn this off to hide filters, results, and all listings.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setEnabled((prev) => !prev)}
          className={`relative h-7 w-14 rounded-full transition ${
            enabled ? "bg-emerald-400/70" : "bg-white/15"
          }`}
        >
          <span
            className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${
              enabled ? "left-8" : "left-1"
            }`}
          />
        </button>
      </div>

      <div className="mt-5">
        <label className="mb-2 block text-sm font-medium text-white/72">
          Disabled marketplace message
        </label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="min-h-28 w-full rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-3 text-white outline-none placeholder:text-white/30 focus:border-white/20"
          placeholder="The marketplace is temporarily unavailable."
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="mt-5 rounded-full bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-white/90 disabled:opacity-50"
      >
        {loading ? "Saving..." : "Save Marketplace Settings"}
      </button>

      {status && <p className="mt-3 text-sm text-white/65">{status}</p>}
    </form>
  );
}