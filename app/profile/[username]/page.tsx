import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ProfileListingsRail from "@/app/components/profile-listings-rail";
import ProfilePostFeed from "@/app/components/profile-post-feed";

type ProfilePageProps = {
  params: Promise<{
    username: string;
  }>;
};

function getTheme(profile: {
  theme_background?: string | null;
  theme_card?: string | null;
  theme_accent?: string | null;
  theme_glow?: string | null;
}) {
  return {
    background: profile.theme_background || "#0b1020",
    card: profile.theme_card || "rgba(255,255,255,0.08)",
    accent: profile.theme_accent || "#8b5cf6",
    glow: profile.theme_glow || "rgba(139,92,246,0.22)",
  };
}

export default async function ProfilePage({ params }: ProfilePageProps) {
  const { username } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile, error } = await supabase
    .from("profiles")
    .select(`
      id,
      username,
      display_name,
      bio,
      average_rating,
      total_reviews,
      total_sales,
      created_at,
      avatar_url,
      banner_url,
      theme_background,
      theme_card,
      theme_accent,
      theme_glow
    `)
    .eq("username", username)
    .single();

  if (error || !profile) {
    notFound();
  }

  const isOwner = user?.id === profile.id;
  const theme = getTheme(profile);

  const [reviewsResult, postsResult, listingsResult] = await Promise.all([
    supabase
      .from("reviews")
      .select("id, rating, comment, created_at, reviewer_id")
      .eq("reviewee_id", profile.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("seller_posts")
      .select("id, caption, image_url, created_at")
      .eq("profile_id", profile.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("listings")
      .select("id, brand, model, nickname, size, condition, price_cents, cover_image_url, status, created_at")
      .eq("seller_id", profile.id)
      .eq("admin_removed", false)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(12),
  ]);

  const reviews = reviewsResult.data ?? [];
  const posts = postsResult.data ?? [];
  const listings = listingsResult.data ?? [];

  const reviewRows = await Promise.all(
    reviews.map(async (review) => {
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

  const displayName = profile.display_name?.trim() || `@${profile.username}`;

  return (
    <main
      className="relative min-h-screen overflow-hidden text-white"
      style={{ backgroundColor: theme.background }}
    >
      <div
        className="absolute inset-0"
        style={{
          background: `
            radial-gradient(circle at top left, ${theme.glow}, transparent 28%),
            radial-gradient(circle at bottom right, rgba(255,255,255,0.05), transparent 24%),
            linear-gradient(to bottom, rgba(255,255,255,0.02), transparent 28%, rgba(255,255,255,0.01))
          `,
        }}
      />
      <div className="absolute inset-0 bg-black/30" />

      <div className="relative mx-auto max-w-7xl px-6 py-10">
        <div
          className="overflow-hidden rounded-[2rem] border border-white/10 shadow-[0_30px_100px_rgba(0,0,0,0.35)]"
          style={{ background: theme.card }}
        >
          <div className="relative h-[240px] sm:h-[300px]">
            {profile.banner_url ? (
              <Image
                src={profile.banner_url}
                alt={`${profile.username} banner`}
                fill
                className="object-cover"
                priority
              />
            ) : (
              <div
                className="absolute inset-0"
                style={{
                  background: `linear-gradient(135deg, ${theme.accent}33 0%, rgba(255,255,255,0.06) 35%, rgba(0,0,0,0.1) 100%)`,
                }}
              />
            )}

            <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/10 to-transparent" />

            <div className="absolute right-4 top-4 flex flex-wrap gap-2 sm:right-6 sm:top-6">
              {isOwner && (
                <>
                  <Link
                    href="/profile/studio"
                    className="rounded-full border border-white/12 bg-white/[0.08] px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/[0.12]"
                  >
                    Edit Storefront
                  </Link>
                  <Link
                    href="/onboarding"
                    className="rounded-full border border-white/12 bg-black/25 px-4 py-2 text-sm font-semibold text-white transition hover:bg-black/35"
                  >
                    Edit Profile Info
                  </Link>
                </>
              )}
            </div>
          </div>

          <div className="relative px-6 pb-8 sm:px-8">
            <div className="-mt-16 flex flex-col gap-6 sm:-mt-20 lg:flex-row lg:items-end lg:justify-between">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-end">
                <div className="relative h-28 w-28 overflow-hidden rounded-[1.75rem] border border-white/15 bg-black/25 shadow-2xl sm:h-36 sm:w-36">
                  {profile.avatar_url ? (
                    <Image
                      src={profile.avatar_url}
                      alt={`${profile.username} avatar`}
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <div
                      className="flex h-full w-full items-center justify-center text-3xl font-semibold text-white"
                      style={{ background: `${theme.accent}33` }}
                    >
                      {profile.username.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>

                <div className="pb-1">
                  <p className="text-xs uppercase tracking-[0.22em] text-white/45">
                    Relay Storefront
                  </p>
                  <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-5xl">
                    {displayName}
                  </h1>
                  <p className="mt-2 text-base text-white/60">@{profile.username}</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 sm:w-auto">
                {[
                  { label: "Rating", value: profile.average_rating ?? 0 },
                  { label: "Reviews", value: profile.total_reviews ?? 0 },
                  { label: "Sales", value: profile.total_sales ?? 0 },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="rounded-[1.5rem] border border-white/10 px-4 py-4 text-center backdrop-blur"
                    style={{ background: "rgba(255,255,255,0.05)" }}
                  >
                    <p className="text-xs uppercase tracking-[0.16em] text-white/45">
                      {item.label}
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-white">{item.value}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-8 grid gap-8 lg:grid-cols-[1.35fr_0.65fr]">
              <div className="space-y-8">
                <section
                  className="rounded-[1.75rem] border border-white/10 p-6 shadow-[0_18px_50px_rgba(0,0,0,0.18)]"
                  style={{ background: "rgba(255,255,255,0.05)" }}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-xs uppercase tracking-[0.22em] text-white/38">
                        Bio
                      </p>
                      <h2 className="mt-2 text-2xl font-semibold text-white">
                        About this seller
                      </h2>
                    </div>

                    <div
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: theme.accent }}
                    />
                  </div>

                  <p className="mt-5 max-w-3xl text-sm leading-8 text-white/72 sm:text-base">
                    {profile.bio || "No bio added yet."}
                  </p>

                  <p className="mt-6 text-sm text-white/42">
                    Member since {new Date(profile.created_at).toLocaleDateString()}
                  </p>
                </section>

                <section
                  className="rounded-[1.75rem] border border-white/10 p-6 shadow-[0_18px_50px_rgba(0,0,0,0.18)]"
                  style={{ background: "rgba(255,255,255,0.05)" }}
                >
                  <div className="mb-5 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-xs uppercase tracking-[0.22em] text-white/38">
                        Inventory
                      </p>
                      <h2 className="mt-2 text-2xl font-semibold text-white">
                        Seller listings
                      </h2>
                    </div>
                    <div className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs font-medium text-white/58">
                      {listings.length} live
                    </div>
                  </div>

                  <ProfileListingsRail listings={listings} accent={theme.accent} />
                </section>

                <section
                  className="rounded-[1.75rem] border border-white/10 p-6 shadow-[0_18px_50px_rgba(0,0,0,0.18)]"
                  style={{ background: "rgba(255,255,255,0.05)" }}
                >
                  <div className="mb-5 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-xs uppercase tracking-[0.22em] text-white/38">
                        Feed
                      </p>
                      <h2 className="mt-2 text-2xl font-semibold text-white">
                        Seller posts
                      </h2>
                    </div>
                  </div>

                  <ProfilePostFeed posts={posts} accent={theme.accent} />
                </section>

                <section
                  className="rounded-[1.75rem] border border-white/10 p-6 shadow-[0_18px_50px_rgba(0,0,0,0.18)]"
                  style={{ background: "rgba(255,255,255,0.05)" }}
                >
                  <div className="mb-5">
                    <p className="text-xs uppercase tracking-[0.22em] text-white/38">
                      Reputation
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold text-white">Reviews</h2>
                  </div>

                  {reviewRows.length === 0 ? (
                    <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.03] p-6 text-white/58">
                      No reviews yet.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {reviewRows.map((review) => (
                        <div
                          key={review.id}
                          className="rounded-[1.4rem] border border-white/10 bg-white/[0.03] p-5"
                        >
                          <div className="flex items-center justify-between gap-4">
                            <p className="font-medium text-white">@{review.reviewerUsername}</p>
                            <p className="text-sm text-white/42">
                              {new Date(review.created_at).toLocaleDateString()}
                            </p>
                          </div>

                          <p className="mt-3 text-white/72">
                            Rating: <span className="font-medium text-white">{review.rating}/5</span>
                          </p>

                          <p className="mt-2 text-white/62">
                            {review.comment || "No comment provided."}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>

              <aside className="space-y-6">
                <div
                  className="rounded-[1.75rem] border border-white/10 p-6"
                  style={{ background: "rgba(255,255,255,0.05)" }}
                >
                  <p className="text-xs uppercase tracking-[0.22em] text-white/38">
                    Store details
                  </p>
                  <div className="mt-5 space-y-4">
                    <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.03] p-4">
                      <p className="text-sm text-white/45">Theme accent</p>
                      <div className="mt-3 flex items-center gap-3">
                        <div
                          className="h-5 w-5 rounded-full border border-white/20"
                          style={{ backgroundColor: theme.accent }}
                        />
                        <p className="text-sm text-white/72">{theme.accent}</p>
                      </div>
                    </div>

                    <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.03] p-4">
                      <p className="text-sm text-white/45">Storefront feel</p>
                      <p className="mt-2 text-sm leading-7 text-white/62">
                        Custom banner, avatar, posts, listings, and seller-specific theming.
                      </p>
                    </div>

                    {isOwner && (
                      <Link
                        href="/profile/studio"
                        className="inline-flex w-full items-center justify-center rounded-full text-sm font-semibold text-white"
                        style={{
                          backgroundColor: theme.accent,
                          color: "#0b0b0f",
                          padding: "0.8rem 1rem",
                        }}
                      >
                        Open Profile Studio
                      </Link>
                    )}
                  </div>
                </div>
              </aside>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}