import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import MarketplaceFilters from "@/app/components/marketplace-filters";

type MarketplacePageProps = {
  searchParams: Promise<{
    query?: string;
    brand?: string;
    condition?: string;
    size?: string;
    min?: string;
    max?: string;
    sort?: string;
  }>;
};

export default async function MarketplacePage({
  searchParams,
}: MarketplacePageProps) {
  const supabase = await createClient();
  const params = await searchParams;

  const queryText = params.query?.trim() ?? "";
  const brand = params.brand?.trim() ?? "";
  const condition = params.condition?.trim() ?? "";
  const size = params.size?.trim() ?? "";
  const min = params.min?.trim() ?? "";
  const max = params.max?.trim() ?? "";
  const sort = params.sort?.trim() ?? "newest";

  let query = supabase
    .from("listings")
    .select(
      "id, brand, model, nickname, size, condition, price_cents, cover_image_url, seller_id, created_at"
    )
    .eq("status", "active");

  if (brand) {
    query = query.ilike("brand", `%${brand}%`);
  }

  if (condition) {
    query = query.eq("condition", condition);
  }

  if (size) {
    const parsedSize = Number(size);
    if (!Number.isNaN(parsedSize)) {
      query = query.eq("size", parsedSize);
    }
  }

  if (min) {
    const parsedMin = Math.round(Number(min) * 100);
    if (!Number.isNaN(parsedMin)) {
      query = query.gte("price_cents", parsedMin);
    }
  }

  if (max) {
    const parsedMax = Math.round(Number(max) * 100);
    if (!Number.isNaN(parsedMax)) {
      query = query.lte("price_cents", parsedMax);
    }
  }

  if (queryText) {
    query = query.or(
      `brand.ilike.%${queryText}%,model.ilike.%${queryText}%,nickname.ilike.%${queryText}%`
    );
  }

  if (sort === "price_asc") {
    query = query.order("price_cents", { ascending: true });
  } else if (sort === "price_desc") {
    query = query.order("price_cents", { ascending: false });
  } else {
    query = query.order("created_at", { ascending: false });
  }

  const { data: listings, error } = await query;

  if (error) {
    return (
      <main className="min-h-screen bg-slate-50 px-6 py-12 text-slate-900">
        <div className="mx-auto max-w-5xl">
          <p>Failed to load marketplace: {error.message}</p>
        </div>
      </main>
    );
  }

  const activeFilterCount = [
    queryText,
    brand,
    condition,
    size,
    min,
    max,
    sort !== "newest" ? sort : "",
  ].filter(Boolean).length;

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-12 text-slate-900">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">
              Relay
            </p>
            <h1 className="mt-2 text-4xl font-bold tracking-tight">Marketplace</h1>
            <p className="mt-3 text-slate-600">
              Browse sneaker listings from Relay sellers.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <p className="text-sm text-slate-500">Results</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">
              {listings.length}
            </p>
          </div>
        </div>

        <MarketplaceFilters />

        {activeFilterCount > 0 && (
          <div className="mt-4 flex items-center gap-2 text-sm text-slate-500">
            <span>{activeFilterCount} active filter{activeFilterCount > 1 ? "s" : ""}</span>
          </div>
        )}

        {listings.length === 0 ? (
          <div className="mt-8 rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-sm">
            <h2 className="text-2xl font-semibold text-slate-900">
              No listings match your filters
            </h2>
            <p className="mt-3 text-slate-600">
              Try broadening your search or clearing a few filters.
            </p>
            <div className="mt-6">
              <Link
                href="/marketplace"
                className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
              >
                Reset Marketplace
              </Link>
            </div>
          </div>
        ) : (
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {listings.map((listing) => (
              <Link
                key={listing.id}
                href={`/listings/${listing.id}`}
                className="group overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition duration-200 hover:-translate-y-1 hover:shadow-lg"
              >
                <div className="relative">
                  {listing.cover_image_url ? (
                    <img
                      src={listing.cover_image_url}
                      alt={`${listing.brand} ${listing.model}`}
                      className="h-72 w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                    />
                  ) : (
                    <div className="flex h-72 w-full items-center justify-center bg-slate-100 text-slate-400">
                      No image
                    </div>
                  )}

                  <div className="absolute left-4 top-4 rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-slate-700 shadow-sm backdrop-blur">
                    {listing.condition}
                  </div>
                </div>

                <div className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-lg font-semibold leading-tight text-slate-900">
                        {listing.brand} {listing.model}
                      </h2>

                      <p className="mt-1 text-sm text-slate-500">
                        {listing.nickname || "Standard release"}
                      </p>
                    </div>

                    <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                      Size {listing.size}
                    </div>
                  </div>

                  <div className="mt-5 flex items-center justify-between">
                    <p className="text-2xl font-bold tracking-tight text-slate-900">
                      ${(listing.price_cents / 100).toFixed(2)}
                    </p>

                    <span className="text-sm font-medium text-blue-600 group-hover:text-blue-700">
                      View listing
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}