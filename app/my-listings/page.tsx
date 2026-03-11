import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function MyListingsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("banned_until, banned_permanently, ban_reason")
    .eq("id", user.id)
    .single();

  const currentlyBanned =
    profile?.banned_permanently ||
    (profile?.banned_until &&
      new Date(profile.banned_until).getTime() > Date.now());

  if (currentlyBanned) {
    return (
      <main className="relay-page">
        <div className="relay-site-bg" />
        <div className="relay-page-shell">
          <div className="mx-auto max-w-3xl rounded-[1.75rem] border border-red-400/20 bg-red-500/10 p-8 text-white shadow-[0_10px_40px_rgba(0,0,0,0.18)] backdrop-blur-xl">
            <h1 className="text-3xl font-bold tracking-tight">Account Restricted</h1>
            <p className="mt-4 text-white/75">
              Your account is currently restricted from managing listings.
            </p>
            {profile?.ban_reason && (
              <p className="mt-3 text-sm text-white/60">Reason: {profile.ban_reason}</p>
            )}
          </div>
        </div>
      </main>
    );
  }

  const { data: listings, error } = await supabase
    .from("listings")
    .select(
      "id, brand, model, nickname, size, condition, price_cents, cover_image_url, status, created_at, admin_removed, admin_removed_reason"
    )
    .eq("seller_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <main className="relay-page">
        <div className="relay-site-bg" />
        <div className="relay-page-shell">
          <div className="mx-auto max-w-5xl">
            <p className="text-white">Failed to load your listings: {error.message}</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="relay-page">
      <div className="relay-site-bg" />
      <div className="relay-page-shell">
        <div className="mx-auto max-w-6xl">
          <p className="relay-eyebrow">Relay</p>
          <h1 className="relay-title">My Listings</h1>
          <p className="relay-subtitle">Manage the sneakers you’ve posted on Relay.</p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/sell"
              className="rounded-full border border-white/10 bg-white/[0.08] px-4 py-2 text-sm font-medium text-white transition hover:bg-white/[0.12]"
            >
              Create Listing
            </Link>

            <Link
              href="/dashboard"
              className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-white transition hover:bg-white/[0.06]"
            >
              Back to Dashboard
            </Link>
          </div>

          {listings.length === 0 ? (
            <div className="relay-empty mt-8">
              <p>You have not created any listings yet.</p>
            </div>
          ) : (
            <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {listings.map((listing) => (
                <div
                  key={listing.id}
                  className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-white/[0.04] text-white shadow-[0_10px_40px_rgba(0,0,0,0.18)] backdrop-blur-xl"
                >
                  <div className="relative">
                    {listing.cover_image_url ? (
                      <img
                        src={listing.cover_image_url}
                        alt={`${listing.brand} ${listing.model}`}
                        className={`h-72 w-full object-cover ${
                          listing.admin_removed ? "grayscale" : ""
                        }`}
                      />
                    ) : (
                      <div className="flex h-72 w-full items-center justify-center bg-white/[0.03] text-white/35">
                        No image
                      </div>
                    )}

                    {listing.admin_removed && (
                      <div className="absolute inset-x-4 top-4 rounded-[1rem] border border-red-400/20 bg-red-500/20 p-4 backdrop-blur-md">
                        <p className="text-sm font-semibold text-white">Removed by Relay</p>
                        <p className="mt-1 text-sm text-white/80">
                          This listing cannot be restored by the seller.
                        </p>
                        {listing.admin_removed_reason && (
                          <p className="mt-2 text-sm text-white/72">
                            Reason: {listing.admin_removed_reason}
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h2 className="text-lg font-semibold text-white">
                          {listing.brand} {listing.model}
                        </h2>

                        <p className="mt-1 text-sm text-white/50">
                          {listing.nickname || "Standard release"}
                        </p>
                      </div>

                      <div className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs font-medium text-white/75">
                        {listing.status}
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between text-sm text-white/60">
                      <span>Size {listing.size}</span>
                      <span>{listing.condition}</span>
                    </div>

                    <p className="mt-4 text-2xl font-bold text-white">
                      ${(listing.price_cents / 100).toFixed(2)}
                    </p>

                    <div className="mt-5 flex flex-wrap gap-3">
                      <Link
                        href={`/listings/${listing.id}`}
                        className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-medium text-white transition hover:bg-white/[0.06]"
                      >
                        View
                      </Link>

                      {!listing.admin_removed && (
                        <Link
                          href={`/my-listings/${listing.id}/edit`}
                          className="rounded-full border border-white/10 bg-white/[0.08] px-3 py-2 text-sm font-medium text-white transition hover:bg-white/[0.12]"
                        >
                          Edit
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}