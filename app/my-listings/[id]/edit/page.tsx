import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import EditListingForm from "@/app/components/edit-listing-form";

type EditListingPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function EditListingPage({
  params,
}: EditListingPageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const { data: listing, error } = await supabase
    .from("listings")
    .select(`
      id,
      seller_id,
      brand,
      model,
      nickname,
      size,
      condition,
      price_cents,
      description,
      status,
      admin_removed,
      admin_removed_reason
    `)
    .eq("id", id)
    .single();

  if (error || !listing) {
    notFound();
  }

  if (listing.seller_id !== user.id) {
    redirect("/my-listings");
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#06070b] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.12),transparent_24%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.05),transparent_24%)]" />
      <div className="absolute inset-0 bg-[#06070b]/80" />

      <div className="relative mx-auto max-w-5xl px-6 py-12">
        <div className="mb-10 flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <div className="inline-flex items-center rounded-full border border-white/12 bg-white/[0.04] px-4 py-2 text-[11px] font-medium uppercase tracking-[0.24em] text-white/68 backdrop-blur">
              Relay Seller Tools
            </div>

            <h1 className="mt-6 text-4xl font-semibold tracking-[-0.04em] text-white sm:text-5xl">
              Edit listing
            </h1>

            <p className="mt-4 text-sm leading-7 text-white/60 sm:text-base">
              Update pricing, condition, status, and description while keeping
              your listing aligned with the rest of your storefront.
            </p>
          </div>

          <Link
            href="/my-listings"
            className="inline-flex items-center justify-center rounded-full border border-white/12 bg-white/[0.05] px-5 py-3 text-sm font-semibold text-white transition hover:border-white/20 hover:bg-white/[0.08]"
          >
            Back to my listings
          </Link>
        </div>

        <EditListingForm listing={listing} />
      </div>
    </main>
  );
}