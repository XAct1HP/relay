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

  const inputClassName =
    "w-full rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-3 text-white outline-none transition placeholder:text-white/30 focus:border-white/20 focus:bg-white/[0.06]";
  const disabledClassName =
    "w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-white/38";
  const labelClassName = "mb-2 block text-sm font-medium text-white/72";

  if (listing.admin_removed) {
    return (
      <div className="mt-8 rounded-[2rem] border border-red-400/20 bg-red-400/8 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.2)] backdrop-blur-xl">
        <p className="text-lg font-semibold text-white">Removed by Relay</p>
        <p className="mt-3 leading-7 text-white/70">
          This listing has been permanently removed from the marketplace and cannot be edited.
        </p>
        {listing.admin_removed_reason && (
          <p className="mt-3 text-sm text-white/58">
            Reason: {listing.admin_removed_reason}
          </p>
        )}
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSave}
      className="mt-8 space-y-5 rounded-[2rem] border border-white/10 bg-white/[0.05] p-6 shadow-[0_24px_70px_rgba(0,0,0,0.22)] backdrop-blur-2xl"
    >
      <div className="mb-2">
        <p className="text-xs uppercase tracking-[0.22em] text-white/38">
          Listing editor
        </p>
        <p className="mt-2 text-xl font-semibold text-white">
          Update your listing details
        </p>
      </div>

      <div>
        <label className={labelClassName}>Brand</label>
        <input
          type="text"
          value={listing.brand}
          disabled
          className={disabledClassName}
        />
      </div>

      <div>
        <label className={labelClassName}>Model</label>
        <input
          type="text"
          value={listing.model}
          disabled
          className={disabledClassName}
        />
      </div>

      <div>
        <label className={labelClassName}>Nickname</label>
        <input
          type="text"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          className={inputClassName}
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label className={labelClassName}>Condition</label>
          <select
            value={condition}
            onChange={(e) => setCondition(e.target.value)}
            className={inputClassName}
          >
            <option>New</option>
            <option>VNDS</option>
            <option>Used</option>
          </select>
        </div>

        <div>
          <label className={labelClassName}>Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className={inputClassName}
          >
            <option value="active">active</option>
            <option value="removed">removed</option>
            {listing.status === "sold" && <option value="sold">sold</option>}
          </select>
        </div>
      </div>

      <div>
        <label className={labelClassName}>Price (USD)</label>
        <input
          type="number"
          step="0.01"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className={inputClassName}
        />
      </div>

      <div>
        <label className={labelClassName}>Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="min-h-32 w-full rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-3 text-white outline-none transition placeholder:text-white/30 focus:border-white/20 focus:bg-white/[0.06]"
        />
      </div>

      <div className="flex flex-wrap gap-3 pt-2">
        <button
          type="submit"
          disabled={loading}
          className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-white/90 disabled:opacity-50"
        >
          {loading ? "Saving..." : "Save Changes"}
        </button>

        <button
          type="button"
          onClick={handleRemove}
          disabled={loading}
          className="rounded-full border border-white/12 bg-white/[0.05] px-5 py-3 text-sm font-semibold text-white transition hover:border-white/20 hover:bg-white/[0.08] disabled:opacity-50"
        >
          Remove Listing
        </button>
      </div>

      {message && <p className="text-sm text-white/65">{message}</p>}
    </form>
  );
}