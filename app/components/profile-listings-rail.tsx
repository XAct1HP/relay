import Link from "next/link";

type Listing = {
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

export default function ProfileListingsRail({
  listings,
  accent,
}: {
  listings: Listing[];
  accent: string;
}) {
  if (listings.length === 0) {
    return (
      <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.03] p-6 text-white/58">
        No active listings right now.
      </div>
    );
  }

  return (
    <div className="max-h-[520px] overflow-y-auto pr-2">
      <div className="grid max-w-[720px] gap-4 sm:grid-cols-2">
        {listings.map((listing) => (
          <Link
            key={listing.id}
            href={`/listings/${listing.id}`}
            className="group overflow-hidden rounded-[1.5rem] border border-white/10 bg-white/[0.04] transition hover:bg-white/[0.06]"
          >
            <div className="relative h-44 overflow-hidden">
              {listing.cover_image_url ? (
                <img
                  src={listing.cover_image_url}
                  alt={`${listing.brand} ${listing.model}`}
                  className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                />
              ) : (
                <div
                  className="flex h-full w-full items-center justify-center text-white/35"
                  style={{ backgroundColor: `${accent}22` }}
                >
                  No image
                </div>
              )}

              <div className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent" />
            </div>

            <div className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-semibold text-white">
                    {listing.brand} {listing.model}
                  </p>
                  <p className="mt-1 text-sm text-white/52">
                    {listing.nickname || "Standard release"}
                  </p>
                </div>

                <div className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs font-medium text-white/65">
                  Size {listing.size}
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between text-sm text-white/62">
                <span>{listing.condition}</span>
                <span className="font-semibold text-white">
                  ${(listing.price_cents / 100).toFixed(2)}
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}