import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import BuyNowButton from "@/app/components/buy-now-button";
import ListingImageGallery from "@/app/components/listing-image-gallery";

type ListingPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function ListingDetailPage({ params }: ListingPageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: listing, error } = await supabase
    .from("listings")
    .select(
      "id, brand, model, nickname, size, condition, price_cents, description, cover_image_url, seller_id, status, created_at"
    )
    .eq("id", id)
    .single();

  if (error || !listing) {
    notFound();
  }

  const [{ data: seller }, { data: listingImages }] = await Promise.all([
    supabase
      .from("profiles")
      .select("username, average_rating, total_sales")
      .eq("id", listing.seller_id)
      .single(),
    supabase
      .from("listing_images")
      .select("id, image_url, sort_order")
      .eq("listing_id", listing.id)
      .order("sort_order", { ascending: true }),
  ]);

  return (
    <main className="relay-page">
      <div className="relay-site-bg" />
      <div className="relay-page-shell">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:gap-8">
            <div>
              <ListingImageGallery
                brand={listing.brand}
                model={listing.model}
                coverImageUrl={listing.cover_image_url}
                images={listingImages ?? []}
              />
            </div>

            <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4 text-white shadow-[0_10px_40px_rgba(0,0,0,0.18)] backdrop-blur-xl sm:rounded-[1.75rem] sm:p-6 lg:p-8">
              <p className="relay-eyebrow !mb-0">Relay Listing</p>

              <h1 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">
                {listing.brand} {listing.model}
              </h1>

              {listing.nickname && (
                <p className="mt-2 text-base text-white/60 sm:text-lg">
                  {listing.nickname}
                </p>
              )}

              <div className="mt-5 flex flex-wrap items-center gap-2 sm:gap-3">
                <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-sm font-medium text-white/75">
                  Size {listing.size}
                </span>
                <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-sm font-medium text-white/75">
                  {listing.condition}
                </span>
                <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-sm font-medium text-white/75">
                  {listing.status}
                </span>
              </div>

              {listing.status === "pending" && (
                <p className="mt-4 text-sm font-medium text-white/65">
                  This listing is currently being purchased by another buyer.
                </p>
              )}

              <p className="mt-7 text-3xl font-bold tracking-tight text-white sm:mt-8 sm:text-4xl">
                ${(listing.price_cents / 100).toFixed(2)}
              </p>

              <div className="mt-7 border-t border-white/10 pt-7 sm:mt-8 sm:pt-8">
                <p className="text-sm font-medium text-white/50">Description</p>
                <p className="mt-3 text-sm leading-7 text-white/75 sm:text-base">
                  {listing.description || "No description added."}
                </p>
              </div>

              {seller && (
                <div className="mt-7 rounded-[1.25rem] border border-white/10 bg-white/[0.03] p-4 sm:mt-8 sm:p-5">
                  <p className="text-sm font-medium text-white/50">Seller</p>
                  <Link
                    href={`/profile/${seller.username}`}
                    className="mt-2 block text-lg font-semibold text-white hover:underline"
                  >
                    @{seller.username}
                  </Link>
                  <p className="mt-2 text-sm text-white/60">
                    Rating: {seller.average_rating} · Sales: {seller.total_sales}
                  </p>
                </div>
              )}

              <div className="mt-7 grid gap-3 sm:mt-8 sm:flex sm:flex-wrap">
                <Link href="/marketplace" className="relay-button-secondary">
                  Back to Marketplace
                </Link>

                <Link
                  href={`/messages/start/${listing.id}`}
                  className="relay-button-secondary"
                >
                  Message Seller
                </Link>

                <BuyNowButton
                  listingId={listing.id}
                  sellerId={listing.seller_id}
                  priceCents={listing.price_cents}
                  status={listing.status}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}