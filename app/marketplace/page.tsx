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

            <div className="mt-8 rounded-[1.75rem] border border-white/10 bg-white/[0.05] px-5 py-8 text-center text-white shadow-[0_24px_70px_rgba(0,0,0,0.22)] backdrop-blur-2xl sm:rounded-[2rem] sm:p-10">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-amber-300/20 bg-amber-300/[0.10] text-xl text-amber-200 sm:h-16 sm:w-16">
                !
              </div>

              <h2 className="mt-5 text-2xl font-semibold tracking-tight text-white sm:mt-6 sm:text-3xl">
                Marketplace unavailable
              </h2>

              <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-white/65 sm:text-base sm:leading-8">
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
          <div className="relay-page-header gap-5">
            <div className="min-w-0">
              <p className="relay-eyebrow">Relay</p>
              <h1 className="relay-title">Marketplace</h1>
              <p className="relay-subtitle">
                Browse sneaker listings from Relay sellers.
              </p>
            </div>

            <div className="w-full rounded-[1.35rem] border border-white/10 bg-white/[0.04] px-4 py-3 text-white backdrop-blur-xl sm:w-auto sm:min-w-[132px] sm:rounded-2xl">
              <p className="text-sm text-white/55">Results</p>
              <p className="mt-1 text-2xl font-semibold">{listings.length}</p>
            </div>
          </div>

          <MarketplaceFilters />

          {activeFilterCount > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-white/50">
              <span>
                {activeFilterCount} active filter{activeFilterCount > 1 ? "s" : ""}
              </span>
            </div>
          )}

          {listings.length === 0 ? (
            <div className="mt-8 rounded-[1.75rem] border border-white/10 bg-white/[0.04] px-5 py-8 text-center text-white backdrop-blur-xl sm:rounded-[2rem] sm:p-10">
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
            <div className="mt-8 grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3">
              {listings.map((listing) => (
                <Link
                  key={listing.id}
                  href={`/listings/${listing.id}`}
                  className="group overflow-hidden rounded-[1.35rem] border border-white/10 bg-white/[0.04] shadow-[0_10px_40px_rgba(0,0,0,0.18)] backdrop-blur-xl transition duration-200 hover:-translate-y-1 hover:bg-white/[0.055] sm:rounded-[1.75rem]"
                >
                  <div className="relative">
                    {listing.cover_image_url ? (
                      <img
                        src={listing.cover_image_url}
                        alt={`${listing.brand} ${listing.model}`}
                        className="h-44 w-full object-cover transition duration-300 group-hover:scale-[1.02] sm:h-60 lg:h-72"
                      />
                    ) : (
                      <div className="flex h-44 w-full items-center justify-center bg-[#10131a] text-sm text-white/35 sm:h-60 lg:h-72">
                        No image
                      </div>
                    )}

                    <div className="absolute left-3 top-3 rounded-full border border-white/10 bg-black/35 px-2.5 py-1 text-[11px] font-medium text-white/80 backdrop-blur sm:left-4 sm:top-4 sm:px-3 sm:text-xs">
                      {listing.condition}
                    </div>
                  </div>

                  <div className="p-3 sm:p-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <h2 className="line-clamp-2 text-sm font-semibold leading-tight text-white sm:text-lg">
                          {listing.brand} {listing.model}
                        </h2>

                        <p className="mt-1 line-clamp-2 text-xs text-white/50 sm:text-sm">
                          {listing.nickname || "Standard release"}
                        </p>
                      </div>

                      <div className="w-fit shrink-0 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-white/70 sm:px-3 sm:text-xs">
                        Size {listing.size}
                      </div>
                    </div>

                    <div className="mt-4 flex flex-col gap-2 sm:mt-5 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-xl font-semibold tracking-tight text-white sm:text-2xl">
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