import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type StartConversationPageProps = {
  params: Promise<{
    listingId: string;
  }>;
};

export default async function StartConversationPage({
  params,
}: StartConversationPageProps) {
  const { listingId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const { data: listing, error: listingError } = await supabase
    .from("listings")
    .select("id, seller_id, status")
    .eq("id", listingId)
    .single();

  if (listingError || !listing) {
    notFound();
  }

  if (listing.seller_id === user.id) {
    redirect(`/listings/${listingId}`);
  }

  const { data: existingConversation } = await supabase
    .from("conversations")
    .select("id")
    .eq("listing_id", listingId)
    .eq("buyer_id", user.id)
    .eq("seller_id", listing.seller_id)
    .maybeSingle();

  if (existingConversation) {
    redirect(`/messages/${existingConversation.id}`);
  }

  const { data: newConversation, error: createError } = await supabase
    .from("conversations")
    .insert({
      listing_id: listingId,
      buyer_id: user.id,
      seller_id: listing.seller_id,
    })
    .select("id")
    .single();

  if (createError || !newConversation) {
    redirect(`/listings/${listingId}`);
  }

  redirect(`/messages/${newConversation.id}`);
}