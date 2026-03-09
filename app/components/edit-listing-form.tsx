"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Listing = {
  id: string;
  brand: string;
  model: string;
  nickname: string | null;
  size: number;
  condition: string;
  price_cents: number;
  description: string | null;
  status: string;
  admin_removed?: boolean | null;
  admin_removed_reason?: string | null;
};

export default function EditListingForm({ listing }: { listing: Listing }) {
  const supabase = createClient();
  const router = useRouter();

  const [nickname, setNickname] = useState(listing.nickname ?? "");
  const [condition, setCondition] = useState(listing.condition);
  const [price, setPrice] = useState((listing.price_cents / 100).toFixed(2));
  const [description, setDescription] = useState(listing.description ?? "");
  const [status, setStatus] = useState(
    listing.status === "sold" ? "sold" : listing.status === "removed" ? "removed" : "active"
  );
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    const parsedPrice = Math.round(Number(price) * 100);

    if (!parsedPrice || parsedPrice <= 0) {
      setMessage("Enter a valid price.");
      setLoading(false);
      return;
    }

    const { data: currentListing, error: currentListingError } = await supabase
      .from("listings")
      .select("admin_removed")
      .eq("id", listing.id)
      .single();

    if (currentListingError) {
      setMessage(currentListingError.message);
      setLoading(false);
      return;
    }

    if (currentListing?.admin_removed) {
      setMessage("This listing was removed by Relay and cannot be edited.");
      setLoading(false);
      return;
    }

    const safeStatus =
      listing.status === "sold"
        ? "sold"
        : status === "removed"
        ? "removed"
        : "active";

    const { error } = await supabase
      .from("listings")
      .update({
        nickname: nickname.trim() || null,
        condition,
        price_cents: parsedPrice,
        description: description.trim() || null,
        status: safeStatus,
      })
      .eq("id", listing.id)
      .eq("admin_removed", false);

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    setLoading(false);
    router.push("/my-listings");
    router.refresh();
  }

  async function handleRemove() {
    const confirmed = window.confirm(
      "Are you sure you want to remove this listing from the marketplace?"
    );

    if (!confirmed) return;

    setLoading(true);
    setMessage("");

    const { data: currentListing, error: currentListingError } = await supabase
      .from("listings")
      .select("admin_removed")
      .eq("id", listing.id)
      .single();

    if (currentListingError) {
      setMessage(currentListingError.message);
      setLoading(false);
      return;
    }

    if (currentListing?.admin_removed) {
      setMessage("This listing was removed by Relay and cannot be changed.");
      setLoading(false);
      return;
    }

    const { error } = await supabase
      .from("listings")
      .update({ status: "removed" })
      .eq("id", listing.id)
      .eq("admin_removed", false);

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    setLoading(false);
    router.push("/my-listings");
    router.refresh();
  }

  if (listing.admin_removed) {
    return (
      <div className="mt-8 rounded-2xl border border-red-200 bg-white p-6 shadow-sm">
        <p className="text-lg font-semibold text-red-700">Removed by Relay</p>
        <p className="mt-3 text-slate-700">
          This listing has been permanently removed from the marketplace and cannot be edited.
        </p>
        {listing.admin_removed_reason && (
          <p className="mt-3 text-sm text-slate-600">
            Reason: {listing.admin_removed_reason}
          </p>
        )}
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSave}
      className="mt-8 space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <div>
        <label className="mb-2 block text-sm font-medium">Brand</label>
        <input
          type="text"
          value={listing.brand}
          disabled
          className="w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-slate-500"
        />
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium">Model</label>
        <input
          type="text"
          value={listing.model}
          disabled
          className="w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-slate-500"
        />
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium">Nickname</label>
        <input
          type="text"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm font-medium">Condition</label>
          <select
            value={condition}
            onChange={(e) => setCondition(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
          >
            <option>New</option>
            <option>VNDS</option>
            <option>Used</option>
          </select>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium">Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
          >
            <option value="active">active</option>
            <option value="removed">removed</option>
            {listing.status === "sold" && <option value="sold">sold</option>}
          </select>
        </div>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium">Price (USD)</label>
        <input
          type="number"
          step="0.01"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
        />
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="min-h-28 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
        />
      </div>

      <div className="flex flex-wrap gap-4">
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-slate-900 px-4 py-2 font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {loading ? "Saving..." : "Save Changes"}
        </button>

        <button
          type="button"
          onClick={handleRemove}
          disabled={loading}
          className="rounded-lg border border-red-300 bg-white px-4 py-2 font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          Remove Listing
        </button>
      </div>

      {message && <p className="text-sm text-slate-600">{message}</p>}
    </form>
  );
}