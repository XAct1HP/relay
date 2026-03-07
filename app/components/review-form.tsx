"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type ReviewFormProps = {
  orderId: string;
  reviewerId: string;
  revieweeId: string;
};

export default function ReviewForm({
  orderId,
  reviewerId,
  revieweeId,
}: ReviewFormProps) {
  const supabase = createClient();
  const router = useRouter();

  const [rating, setRating] = useState("5");
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    const parsedRating = Number(rating);

    if (parsedRating < 1 || parsedRating > 5) {
      setMessage("Rating must be between 1 and 5.");
      setLoading(false);
      return;
    }

    const { error } = await supabase.from("reviews").insert({
      order_id: orderId,
      reviewer_id: reviewerId,
      reviewee_id: revieweeId,
      rating: parsedRating,
      comment: comment.trim() || null,
    });

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    setLoading(false);
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-6 space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <h3 className="text-xl font-semibold">Leave a Review</h3>

      <div>
        <label className="mb-2 block text-sm font-medium">Rating</label>
        <select
          value={rating}
          onChange={(e) => setRating(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
        >
          <option value="5">5 - Excellent</option>
          <option value="4">4 - Good</option>
          <option value="3">3 - Average</option>
          <option value="2">2 - Poor</option>
          <option value="1">1 - Bad</option>
        </select>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium">Comment</label>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Fast shipping, great condition, smooth transaction."
          className="min-h-28 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="rounded-lg bg-slate-900 px-4 py-2 font-medium text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {loading ? "Submitting..." : "Submit Review"}
      </button>

      {message && <p className="text-sm text-slate-600">{message}</p>}
    </form>
  );
}