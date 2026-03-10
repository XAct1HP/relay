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
    listing.status === "sold"
      ? "sold"
      : listing.status === "removed"
        ? "removed"
        : "active"
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
  const selectClassName =
    "w-full appearance-none rounded-2xl border border-white/10 bg-[#0f1117] px-4 py-3 text-white outline-none transition focus:border-white/20 focus:bg-[#151922]";
  const disabledClassName =
    "w-full rounded-2xl border border-white/10 bg-white/[0.025] px-4 py-3 text-white/55";
  const labelClassName = "mb-2 block text-sm font-medium text-white/72";

  if (listing.admin_removed) {
    return (
      <div className="rounded-[2rem] border border-red-400/20 bg-red-400/[0.08] p-6 shadow-[0_24px_70px_rgba(0,0,0,0.22)] backdrop-blur-2xl">
        <p className="text-lg font-semibold text-white">Removed by Relay</p>
        <p className="mt-3 leading-7 text-white/72">
          This listing has been permanently removed from the marketplace and
          cannot be edited.
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
      className="rounded-[2rem] border border-white/10 bg-white/[0.05] p-6 shadow-[0_24px_70px_rgba(0,0,0,0.22)] backdrop-blur-2xl sm:p-8"
    >
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-white/38">
            Listing editor
          </p>
          <p className="mt-2 text-2xl font-semibold text-white">
            Update your listing
          </p>
        </div>

        <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-medium text-white/58">
          Size {listing.size}
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label className={labelClassName}>Brand</label>
          <input type="text" value={listing.brand} disabled className={disabledClassName} />
        </div>

        <div>
          <label className={labelClassName}>Model</label>
          <input type="text" value={listing.model} disabled className={disabledClassName} />
        </div>
      </div>

      <div className="mt-5">
        <label className={labelClassName}>Nickname</label>
        <input
          type="text"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder="Optional release nickname"
          className={inputClassName}
        />
      </div>

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <div>
          <label className={labelClassName}>Condition</label>
          <select
            value={condition}
            onChange={(e) => setCondition(e.target.value)}
            className={selectClassName}
          >
            <option value="New" className="bg-[#0f1117] text-white">New</option>
            <option value="VNDS" className="bg-[#0f1117] text-white">VNDS</option>
            <option value="Used" className="bg-[#0f1117] text-white">Used</option>
          </select>
        </div>

        <div>
          <label className={labelClassName}>Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className={selectClassName}
          >
            <option value="active" className="bg-[#0f1117] text-white">active</option>
            <option value="removed" className="bg-[#0f1117] text-white">removed</option>
            {listing.status === "sold" && (
              <option value="sold" className="bg-[#0f1117] text-white">sold</option>
            )}
          </select>
        </div>
      </div>

      <div className="mt-5">
        <label className={labelClassName}>Price (USD)</label>
        <input
          type="number"
          step="0.01"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className={inputClassName}
        />
      </div>

      <div className="mt-5">
        <label className={labelClassName}>Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Add details buyers should know about the pair."
          className="min-h-32 w-full rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-3 text-white outline-none transition placeholder:text-white/30 focus:border-white/20 focus:bg-white/[0.06]"
        />
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
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

      {message && (
        <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3 text-sm text-white/70">
          {message}
        </div>
      )}
    </form>
  );
}