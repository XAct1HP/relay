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

type ProfileRow = {
  id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  average_rating: number | null;
  total_reviews: number | null;
  total_sales: number | null;
  created_at: string;

  accent_color?: string | null;
  background_color?: string | null;
  card_color?: string | null;

  theme_background?: string | null;
  theme_card?: string | null;
  theme_accent?: string | null;
  theme_glow?: string | null;
};

type ReviewRow = {
  id: string;
  reviewer_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
};

type ReviewRowWithUser = ReviewRow & {
  reviewerUsername: string;
};

type PostRow = {
  id: string;
  caption: string | null;
  image_url: string | null;
  created_at: string;
};

type ListingRow = {
  id: string;
  brand: string;
  model: string;
  nickname: string | null;
  size: number;
  condition: string;
  price_cents: number;
  cover_image_url: string | null;
  status: string;
  created_at: string;
};

function normalizeHex(value?: string | null) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith("#")) return null;

  const hex = trimmed.slice(1);

  if (/^[0-9a-fA-F]{6}$/.test(hex)) {
    return `#${hex}`;
  }

  if (/^[0-9a-fA-F]{3}$/.test(hex)) {
    const expanded = hex
      .split("")
      .map((char) => char + char)
      .join("");
    return `#${expanded}`;
  }

  return null;
}

function isRgbString(value?: string | null) {
  if (!value) return false;
  const trimmed = value.trim().toLowerCase();
  return trimmed.startsWith("rgb(") || trimmed.startsWith("rgba(");
}

function hexToRgba(hex: string | null | undefined, alpha: number) {
  const safeHex = normalizeHex(hex);

  if (!safeHex) {
    return `rgba(255,255,255,${alpha})`;
  }

  const raw = safeHex.replace("#", "");
  const r = Number.parseInt(raw.slice(0, 2), 16);
  const g = Number.parseInt(raw.slice(2, 4), 16);
  const b = Number.parseInt(raw.slice(4, 6), 16);

  if ([r, g, b].some(Number.isNaN)) {
    return `rgba(255,255,255,${alpha})`;
  }

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getTheme(profile: ProfileRow) {
  const accent =
    normalizeHex(profile.theme_accent) ||
    normalizeHex(profile.accent_color) ||
    "#7ca6ff";

  const background =
    normalizeHex(profile.theme_background) ||
    normalizeHex(profile.background_color) ||
    "#06070a";

  const rawCard = profile.theme_card?.trim() || profile.card_color?.trim() || null;
  const cardHex = normalizeHex(rawCard);
  const cardRgb = isRgbString(rawCard) ? rawCard!.trim() : null;
  const card = cardRgb || cardHex || "#10131a";

  const glow =
    (profile.theme_glow?.trim() && isRgbString(profile.theme_glow)
      ? profile.theme_glow.trim()
      : null) || hexToRgba(accent, 0.18);

  return {
    accent,
    background,
    card,
    glow,
  };
}

function cardBackground(cardColor: string | null | undefined) {
  if (!cardColor) {
    return "linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.035) 100%)";
  }

  if (isRgbString(cardColor)) {
    return `linear-gradient(180deg, ${cardColor} 0%, rgba(255,255,255,0.035) 100%)`;
  }

  const safeHex = normalizeHex(cardColor);

  if (!safeHex) {
    return "linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.035) 100%)";
  }

  return `linear-gradient(180deg, ${hexToRgba(safeHex, 0.6)} 0%, rgba(255,255,255,0.035) 100%)`;
}

async function getReviews(
  supabase: Awaited<ReturnType<typeof createClient>>,
  profileId: string
) {
  const reviewedResult = await supabase
    .from("reviews")
    .select("id, reviewer_id, rating, comment, created_at")
    .eq("reviewed_id", profileId)
    .order("created_at", { ascending: false })
    .limit(12);

  if (!reviewedResult.error) {
    return (reviewedResult.data ?? []) as ReviewRow[];
  }

  const revieweeResult = await supabase
    .from("reviews")
    .select("id, reviewer_id, rating, comment, created_at")
    .eq("reviewee_id", profileId)
    .order("created_at", { ascending: false })
    .limit(12);

  return (revieweeResult.data ?? []) as ReviewRow[];
}

export default async function ProfilePage({ params }: ProfilePageProps) {
  const { username } = await params;
  const supabase = await createClient();

  const [
    {
      data: { user },
    },
    profileResult,
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("profiles").select("*").eq("username", username).maybeSingle(),
  ]);

  const profile = profileResult.data as ProfileRow | null;

  if (!profile) {
    notFound();
  }

  const isOwner = Boolean(user && user.id === profile.id);
  const theme = getTheme(profile);

  const [reviews, postsResult, listingsResult] = await Promise.all([
    getReviews(supabase, profile.id),
    supabase
      .from("seller_posts")
      .select("id, caption, image_url, created_at")
      .eq("profile_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(12),
    supabase
      .from("listings")
      .select(
        "id, brand, model, nickname, size, condition, price_cents, cover_image_url, status, created_at"
      )
      .eq("seller_id", profile.id)
      .eq("status", "active")
      .eq("admin_removed", false)
      .order("created_at", { ascending: false })
      .limit(12),
  ]);

  const posts = (postsResult.data ?? []) as PostRow[];
  const listings = (listingsResult.data ?? []) as ListingRow[];

  const reviewRows: ReviewRowWithUser[] = await Promise.all(
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

      <div className="relative mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
        <div
          className="overflow-hidden rounded-[1.75rem] border border-white/10 shadow-[0_30px_100px_rgba(0,0,0,0.35)] sm:rounded-[2rem]"
          style={{ background: cardBackground(theme.card) }}
        >
          <div className="relative h-[190px] sm:h-[250px] lg:h-[300px]">
            {profile.banner_url ? (
              <img
                src={profile.banner_url}
                alt={`${profile.username} banner`}
                className="h-full w-full object-cover"
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
          </div>

          <div className="relative px-4 pb-6 sm:px-8 sm:pb-8">
            <div className="-mt-14 sm:-mt-20">
              <div className="relative h-24 w-24 overflow-hidden rounded-[1.4rem] border border-white/15 bg-black/25 shadow-2xl sm:h-36 sm:w-36 sm:rounded-[1.75rem]">
                {profile.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt={`${profile.username} avatar`}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div
                    className="flex h-full w-full items-center justify-center text-2xl font-semibold text-white sm:text-3xl"
                    style={{ background: `${theme.accent}33` }}
                  >
                    {profile.username.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>

              <div className="mt-4 sm:mt-5">
                <p className="text-[11px] uppercase tracking-[0.22em] text-white/45 sm:text-xs">
                  Relay Storefront
                </p>
                <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-4xl lg:text-5xl">
                  {displayName}
                </h1>
                <p className="mt-2 text-sm text-white/60 sm:text-base">
                  @{profile.username}
                </p>
              </div>

              <div className="mt-5 max-w-3xl border-t border-white/10 pt-5 sm:mt-6 sm:pt-6">
                <p className="text-sm leading-7 text-white/72 sm:text-base sm:leading-8">
                  {profile.bio || "No bio added yet."}
                </p>

                <p className="mt-4 text-sm text-white/42 sm:mt-5">
                  Member since {new Date(profile.created_at).toLocaleDateString()}
                </p>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-3 sm:mt-8 sm:grid-cols-3">
              {[
                { label: "Rating", value: profile.average_rating ?? 0 },
                { label: "Reviews", value: profile.total_reviews ?? 0 },
                { label: "Sales", value: profile.total_sales ?? 0 },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-[1.25rem] border border-white/10 px-4 py-4 text-center backdrop-blur sm:rounded-[1.5rem]"
                  style={{ background: "rgba(255,255,255,0.05)" }}
                >
                  <p className="text-xs uppercase tracking-[0.16em] text-white/45">
                    {item.label}
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-white">{item.value}</p>
                </div>
              ))}
            </div>

            <div
              className={`mt-8 grid gap-6 sm:gap-8 ${
                isOwner ? "lg:grid-cols-[1.35fr_0.65fr]" : "lg:grid-cols-1"
              }`}
            >
              <div className="space-y-6 sm:space-y-8">
                <section
                  className="rounded-[1.5rem] border border-white/10 p-4 shadow-[0_18px_50px_rgba(0,0,0,0.18)] sm:rounded-[1.75rem] sm:p-6"
                  style={{ background: "rgba(255,255,255,0.05)" }}
                >
                  <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-[0.22em] text-white/38">
                        Inventory
                      </p>
                      <h2 className="mt-2 text-2xl font-semibold text-white">
                        Seller listings
                      </h2>
                    </div>
                    <div className="w-fit rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs font-medium text-white/58">
                      {listings.length} live
                    </div>
                  </div>

                  <ProfileListingsRail
                    listings={listings}
                    accent={theme.accent}
                    isOwner={isOwner}
                  />
                </section>

                <section
                  className="rounded-[1.5rem] border border-white/10 p-4 shadow-[0_18px_50px_rgba(0,0,0,0.18)] sm:rounded-[1.75rem] sm:p-6"
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

                  <ProfilePostFeed
                    posts={posts}
                    accent={theme.accent}
                    isOwner={isOwner}
                  />
                </section>

                <section
                  className="rounded-[1.5rem] border border-white/10 p-4 shadow-[0_18px_50px_rgba(0,0,0,0.18)] sm:rounded-[1.75rem] sm:p-6"
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
                          className="rounded-[1.25rem] border border-white/10 bg-white/[0.03] p-4 sm:rounded-[1.4rem] sm:p-5"
                        >
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <p className="font-medium text-white">
                              @{review.reviewerUsername}
                            </p>
                            <p className="text-sm text-white/42">
                              {new Date(review.created_at).toLocaleDateString()}
                            </p>
                          </div>

                          <p className="mt-3 text-white/72">
                            Rating:{" "}
                            <span className="font-medium text-white">
                              {review.rating}/5
                            </span>
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

              {isOwner && (
                <aside className="space-y-6">
                  <div
                    className="rounded-[1.5rem] border border-white/10 p-4 sm:rounded-[1.75rem] sm:p-6"
                    style={{ background: "rgba(255,255,255,0.05)" }}
                  >
                    <p className="text-xs uppercase tracking-[0.22em] text-white/38">
                      Store details
                    </p>

                    <div className="mt-5 space-y-4">
                      <div className="rounded-[1.1rem] border border-white/10 bg-white/[0.03] p-4 sm:rounded-[1.25rem]">
                        <p className="text-sm text-white/45">Theme accent</p>
                        <div className="mt-3 flex items-center gap-3">
                          <div
                            className="h-5 w-5 rounded-full border border-white/20"
                            style={{ backgroundColor: theme.accent }}
                          />
                          <p className="text-sm text-white/65">{theme.accent}</p>
                        </div>
                      </div>

                      <div className="rounded-[1.1rem] border border-white/10 bg-white/[0.03] p-4 sm:rounded-[1.25rem]">
                        <p className="text-sm text-white/45">Storefront feel</p>
                        <p className="mt-2 text-sm leading-7 text-white/62">
                          Custom banner, avatar, posts, listings, and seller-specific
                          theming.
                        </p>
                      </div>

                      <Link
                        href="/profile/studio"
                        className="inline-flex min-h-12 w-full items-center justify-center rounded-full px-4 py-3 text-sm font-semibold text-black"
                        style={{
                          backgroundColor: theme.accent,
                        }}
                      >
                        Open Profile Studio
                      </Link>

                      <Link
                        href="/onboarding"
                        className="inline-flex min-h-12 w-full items-center justify-center rounded-full border border-white/12 bg-white/[0.05] px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/[0.08]"
                      >
                        Edit Profile Info
                      </Link>
                    </div>
                  </div>
                </aside>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}