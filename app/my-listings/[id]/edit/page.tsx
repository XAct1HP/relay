import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import EditListingForm from "@/app/components/edit-listing-form";

type EditListingPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function EditListingPage({ params }: EditListingPageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("banned_until, banned_permanently")
    .eq("id", user.id)
    .single();

  const currentlyBanned =
    profile?.banned_permanently ||
    (profile?.banned_until &&
      new Date(profile.banned_until).getTime() > Date.now());

  if (currentlyBanned) {
    redirect("/dashboard");
  }

  const { data: listing, error } = await supabase
    .from("listings")
    .select(
      "id, seller_id, brand, model, nickname, size, condition, price_cents, description, status, admin_removed, admin_removed_reason"
    )
    .eq("id", id)
    .single();

  if (error || !listing) {
    notFound();
  }

  if (listing.seller_id !== user.id) {
    redirect("/my-listings");
  }

  if (listing.admin_removed) {
    redirect("/my-listings");
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-12 text-slate-900">
      <div className="mx-auto max-w-2xl">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">
          Relay
        </p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight">Edit Listing</h1>
        <p className="mt-3 text-slate-600">Update your sneaker listing.</p>

        <EditListingForm listing={listing} />
      </div>
    </main>
  );
}