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
    <main className="min-h-screen bg-slate-50 px-6 py-12 text-slate-900">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <ListingImageGallery
            brand={listing.brand}
            model={listing.model}
            coverImageUrl={listing.cover_image_url}
            images={listingImages ?? []}
          />

          <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">
              Relay Listing
            </p>

            <h1 className="mt-3 text-4xl font-bold tracking-tight">
              {listing.brand} {listing.model}
            </h1>

            {listing.nickname && (
              <p className="mt-2 text-lg text-slate-600">{listing.nickname}</p>
            )}

            <div className="mt-6 flex items-center gap-3">
              <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
                Size {listing.size}
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
                {listing.condition}
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
                {listing.status}
              </span>
            </div>

            {listing.status === "pending" && (
              <p className="mt-4 text-sm font-medium text-amber-600">
                This listing is currently being purchased by another buyer.
              </p>
            )}

            <p className="mt-8 text-4xl font-bold tracking-tight">
              ${(listing.price_cents / 100).toFixed(2)}
            </p>

            <div className="mt-8 border-t border-slate-200 pt-8">
              <p className="text-sm font-medium text-slate-500">Description</p>
              <p className="mt-3 leading-7 text-slate-700">
                {listing.description || "No description added."}
              </p>
            </div>

            {seller && (
              <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <p className="text-sm font-medium text-slate-500">Seller</p>
                <Link
                  href={`/profile/${seller.username}`}
                  className="mt-2 block text-lg font-semibold hover:underline"
                >
                  @{seller.username}
                </Link>
                <p className="mt-2 text-sm text-slate-600">
                  Rating: {seller.average_rating} · Sales: {seller.total_sales}
                </p>
              </div>
            )}

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/marketplace"
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100"
              >
                Back to Marketplace
              </Link>

              <Link
                href={`/messages/start/${listing.id}`}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100"
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
    </main>
  );
}