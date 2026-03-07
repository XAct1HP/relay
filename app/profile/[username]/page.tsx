import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type ProfilePageProps = {
  params: Promise<{
    username: string;
  }>;
};

export default async function ProfilePage({ params }: ProfilePageProps) {
  const { username } = await params;
  const supabase = await createClient();

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, username, bio, average_rating, total_reviews, total_sales, created_at")
    .eq("username", username)
    .single();

  if (error || !profile) {
    notFound();
  }

  const { data: reviews } = await supabase
    .from("reviews")
    .select("id, rating, comment, created_at, reviewer_id")
    .eq("reviewee_id", profile.id)
    .order("created_at", { ascending: false });

  const reviewRows = await Promise.all(
    (reviews ?? []).map(async (review) => {
      const { data: reviewer } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", review.reviewer_id)
        .maybeSingle();

      return {
        ...review,
        reviewerUsername: reviewer?.username ?? "unknown-user",
      };
    })
  );

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-12 text-slate-900">
      <div className="mx-auto max-w-4xl">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">
          Relay Profile
        </p>

        <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="text-3xl font-bold tracking-tight">
            @{profile.username}
          </h1>

          <p className="mt-4 text-slate-600">
            {profile.bio || "No bio added yet."}
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <p className="text-sm text-slate-500">Rating</p>
              <p className="mt-2 text-2xl font-semibold">{profile.average_rating}</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <p className="text-sm text-slate-500">Reviews</p>
              <p className="mt-2 text-2xl font-semibold">{profile.total_reviews}</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <p className="text-sm text-slate-500">Sales</p>
              <p className="mt-2 text-2xl font-semibold">{profile.total_sales}</p>
            </div>
          </div>

          <p className="mt-8 text-sm text-slate-500">
            Member since {new Date(profile.created_at).toLocaleDateString()}
          </p>

          <div className="mt-8">
          <h2 className="text-2xl font-semibold">Reviews</h2>

          {reviewRows.length === 0 ? (
            <div className="mt-4 rounded-xl border border-slate-200 bg-white p-6">
              <p className="text-slate-600">No reviews yet.</p>
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              {reviewRows.map((review) => (
                <div
                  key={review.id}
                  className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
                >
                  <div className="flex items-center justify-between gap-4">
                    <p className="font-medium">@{review.reviewerUsername}</p>
                    <p className="text-sm text-slate-500">
                      {new Date(review.created_at).toLocaleDateString()}
                    </p>
                  </div>

                  <p className="mt-3 text-slate-700">
                    Rating: <span className="font-medium">{review.rating}/5</span>
                  </p>

                  <p className="mt-2 text-slate-600">
                    {review.comment || "No comment provided."}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
        </div>
      </div>
    </main>
  );
}