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
      <main className="min-h-screen bg-slate-50 px-6 py-12 text-slate-900">
        <div className="mx-auto max-w-3xl rounded-3xl border border-red-200 bg-white p-8 shadow-sm">
          <h1 className="text-3xl font-bold tracking-tight">Account Restricted</h1>
          <p className="mt-4 text-slate-700">
            Your account is currently restricted from managing listings.
          </p>
          {profile?.ban_reason && (
            <p className="mt-3 text-sm text-slate-600">Reason: {profile.ban_reason}</p>
          )}
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
      <main className="min-h-screen bg-slate-50 px-6 py-12 text-slate-900">
        <div className="mx-auto max-w-5xl">
          <p>Failed to load your listings: {error.message}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-12 text-slate-900">
      <div className="mx-auto max-w-6xl">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">
          Relay
        </p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight">My Listings</h1>
        <p className="mt-3 text-slate-600">
          Manage the sneakers you’ve posted on Relay.
        </p>

        <div className="mt-6 flex gap-4">
          <Link
            href="/sell"
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Create Listing
          </Link>

          <Link
            href="/dashboard"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100"
          >
            Back to Dashboard
          </Link>
        </div>

        {listings.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
            <p className="text-slate-600">You have not created any listings yet.</p>
          </div>
        ) : (
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {listings.map((listing) => (
              <div
                key={listing.id}
                className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"
              >
                {listing.cover_image_url ? (
                  <img
                    src={listing.cover_image_url}
                    alt={`${listing.brand} ${listing.model}`}
                    className="h-72 w-full object-cover"
                  />
                ) : (
                  <div className="flex h-72 w-full items-center justify-center bg-slate-100 text-slate-400">
                    No image
                  </div>
                )}

                <div className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-lg font-semibold">
                        {listing.brand} {listing.model}
                      </h2>

                      <p className="mt-1 text-sm text-slate-500">
                        {listing.nickname || "Standard release"}
                      </p>
                    </div>

                    <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                      {listing.status}
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
                    <span>Size {listing.size}</span>
                    <span>{listing.condition}</span>
                  </div>

                  <p className="mt-4 text-2xl font-bold">
                    ${(listing.price_cents / 100).toFixed(2)}
                  </p>

                  {listing.admin_removed && (
                    <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3">
                      <p className="text-sm font-medium text-red-700">
                        Removed by Relay
                      </p>
                      <p className="mt-1 text-sm text-red-600">
                        This listing cannot be restored by the seller.
                      </p>
                      {listing.admin_removed_reason && (
                        <p className="mt-1 text-sm text-red-600">
                          Reason: {listing.admin_removed_reason}
                        </p>
                      )}
                    </div>
                  )}

                  <div className="mt-5 flex flex-wrap gap-3">
                    <Link
                      href={`/listings/${listing.id}`}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100"
                    >
                      View
                    </Link>

                    {!listing.admin_removed && (
                      <Link
                        href={`/my-listings/${listing.id}/edit`}
                        className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
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
    </main>
  );
}