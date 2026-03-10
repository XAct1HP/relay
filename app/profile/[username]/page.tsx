import Link from "next/link";
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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, username, bio, average_rating, total_reviews, total_sales, created_at")
    .eq("username", username)
    .single();

  if (error || !profile) {
    notFound();
  }

  const isOwner = user?.id === profile.id;

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
    <main className="relay-page">
      <div className="relay-site-bg" />
      <div className="relay-page-shell">
        <div className="mx-auto max-w-5xl">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="relay-eyebrow">Relay Profile</p>
              <h1 className="relay-title">@{profile.username}</h1>
              <p className="relay-subtitle">
                Seller profile, reviews, and marketplace reputation.
              </p>
            </div>

            {isOwner && (
              <Link
                href="/onboarding"
                className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-white transition hover:bg-white/[0.06]"
              >
                Edit Profile
              </Link>
            )}
          </div>

          <div className="mt-8 rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-8 text-white shadow-[0_10px_40px_rgba(0,0,0,0.18)] backdrop-blur-xl">
            <p className="text-white/75">
              {profile.bio || "No bio added yet."}
            </p>

            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.03] p-5">
                <p className="text-sm text-white/50">Rating</p>
                <p className="mt-2 text-2xl font-semibold text-white">
                  {profile.average_rating ?? 0}
                </p>
              </div>

              <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.03] p-5">
                <p className="text-sm text-white/50">Reviews</p>
                <p className="mt-2 text-2xl font-semibold text-white">
                  {profile.total_reviews ?? 0}
                </p>
              </div>

              <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.03] p-5">
                <p className="text-sm text-white/50">Sales</p>
                <p className="mt-2 text-2xl font-semibold text-white">
                  {profile.total_sales ?? 0}
                </p>
              </div>
            </div>

            <p className="mt-8 text-sm text-white/45">
              Member since {new Date(profile.created_at).toLocaleDateString()}
            </p>

            <div className="mt-8">
              <h2 className="text-2xl font-semibold text-white">Reviews</h2>

              {reviewRows.length === 0 ? (
                <div className="relay-empty mt-4">
                  <p>No reviews yet.</p>
                </div>
              ) : (
                <div className="mt-4 space-y-4">
                  {reviewRows.map((review) => (
                    <div
                      key={review.id}
                      className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-6 shadow-[0_10px_32px_rgba(0,0,0,0.14)]"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <p className="font-medium text-white">
                          @{review.reviewerUsername}
                        </p>
                        <p className="text-sm text-white/45">
                          {new Date(review.created_at).toLocaleDateString()}
                        </p>
                      </div>

                      <p className="mt-3 text-white/70">
                        Rating: <span className="font-medium text-white">{review.rating}/5</span>
                      </p>

                      <p className="mt-2 text-white/65">
                        {review.comment || "No comment provided."}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}