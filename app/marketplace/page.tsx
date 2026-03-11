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

  const { data: marketplaceSettingsRow } = await supabase
    .from("site_settings")
    .select("value")
    .eq("key", "marketplace")
    .maybeSingle();

  const marketplaceSettings = marketplaceSettingsRow?.value ?? {
    enabled: true,
    disabledMessage: "The marketplace is temporarily unavailable.",
  };

  const marketplaceEnabled = Boolean(marketplaceSettings.enabled);
  const disabledMessage =
    typeof marketplaceSettings.disabledMessage === "string" &&
    marketplaceSettings.disabledMessage.trim()
      ? marketplaceSettings.disabledMessage.trim()
      : "The marketplace is temporarily unavailable.";

  if (!marketplaceEnabled) {
    return (
      <main className="relay-page">
        <div className="relay-site-bg" />
        <div className="relay-page-shell">
          <div className="mx-auto max-w-5xl">
            <div className="relay-page-header">
              <div>
                <p className="relay-eyebrow">Relay</p>
                <h1 className="relay-title">Marketplace</h1>
                <p className="relay-subtitle">
                  Browse sneaker listings from Relay sellers.
                </p>
              </div>
            </div>

            <div className="mt-8 rounded-[2rem] border border-white/10 bg-white/[0.05] p-10 text-center text-white shadow-[0_24px_70px_rgba(0,0,0,0.22)] backdrop-blur-2xl">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-amber-300/20 bg-amber-300/[0.10] text-xl text-amber-200">
                !
              </div>

              <h2 className="mt-6 text-3xl font-semibold tracking-tight text-white">
                Marketplace unavailable
              </h2>

              <p className="mx-auto mt-4 max-w-2xl text-sm leading-8 text-white/65 sm:text-base">
                {disabledMessage}
              </p>
            </div>
          </div>
        </div>
      </main>
    );
  }

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
    .eq("status", "active")
    .eq("admin_removed", false);

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
      <main className="relay-page">
        <div className="relay-site-bg" />
        <div className="relay-page-shell">
          <div className="relay-page-container">
            <p className="text-white">Failed to load marketplace: {error.message}</p>
          </div>
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
    <main className="relay-page">
      <div className="relay-site-bg" />
      <div className="relay-page-shell">
        <div className="mx-auto max-w-6xl">
          <div className="relay-page-header">
            <div>
              <p className="relay-eyebrow">Relay</p>
              <h1 className="relay-title">Marketplace</h1>
              <p className="relay-subtitle">Browse sneaker listings from Relay sellers.</p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-white backdrop-blur-xl">
              <p className="text-sm text-white/55">Results</p>
              <p className="mt-1 text-2xl font-semibold">{listings.length}</p>
            </div>
          </div>

          <MarketplaceFilters />

          {activeFilterCount > 0 && (
            <div className="mt-4 flex items-center gap-2 text-sm text-white/50">
              <span>
                {activeFilterCount} active filter{activeFilterCount > 1 ? "s" : ""}
              </span>
            </div>
          )}

          {listings.length === 0 ? (
            <div className="mt-8 rounded-[2rem] border border-white/10 bg-white/[0.04] p-10 text-center text-white backdrop-blur-xl">
              <h2 className="text-2xl font-semibold">No listings match your filters</h2>
              <p className="mt-3 text-white/65">
                Try broadening your search or clearing a few filters.
              </p>
              <div className="mt-6">
                <Link href="/marketplace" className="relay-button-primary">
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
                  className="group overflow-hidden rounded-[1.75rem] border border-white/10 bg-white/[0.04] shadow-[0_10px_40px_rgba(0,0,0,0.18)] backdrop-blur-xl transition duration-200 hover:-translate-y-1 hover:bg-white/[0.055]"
                >
                  <div className="relative">
                    {listing.cover_image_url ? (
                      <img
                        src={listing.cover_image_url}
                        alt={`${listing.brand} ${listing.model}`}
                        className="h-72 w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                      />
                    ) : (
                      <div className="flex h-72 w-full items-center justify-center bg-[#10131a] text-white/35">
                        No image
                      </div>
                    )}

                    <div className="absolute left-4 top-4 rounded-full border border-white/10 bg-black/35 px-3 py-1 text-xs font-medium text-white/80 backdrop-blur">
                      {listing.condition}
                    </div>
                  </div>

                  <div className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h2 className="text-lg font-semibold leading-tight text-white">
                          {listing.brand} {listing.model}
                        </h2>

                        <p className="mt-1 text-sm text-white/50">
                          {listing.nickname || "Standard release"}
                        </p>
                      </div>

                      <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/70">
                        Size {listing.size}
                      </div>
                    </div>

                    <div className="mt-5 flex items-center justify-between">
                      <p className="text-2xl font-semibold tracking-tight text-white">
                        ${(listing.price_cents / 100).toFixed(2)}
                      </p>

                      <span className="text-sm font-medium text-blue-300 group-hover:text-blue-200">
                        View listing
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}