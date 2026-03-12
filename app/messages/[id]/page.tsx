import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ChatThread from "@/app/components/chat-thread";
import SendOfferForm from "@/app/components/send-offer-form";

type MessagePageProps = {
  params: Promise<{
    id: string;
  }>;
};

type MessageItem = {
  type: "message";
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
};

type OfferItem = {
  type: "offer";
  id: string;
  conversation_id: string;
  listing_id: string;
  seller_id: string;
  buyer_id: string;
  amount_cents: number;
  status: string;
  expires_at: string | null;
  created_at: string;
};

export default async function MessagePage({ params }: MessagePageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const { data: conversation, error } = await supabase
    .from("conversations")
    .select("id, buyer_id, seller_id, listing_id")
    .eq("id", id)
    .single();

  if (error || !conversation) {
    notFound();
  }

  const isParticipant =
    conversation.buyer_id === user.id || conversation.seller_id === user.id;

  if (!isParticipant) {
    redirect("/messages");
  }

  await supabase
    .from("messages")
    .update({ read_at: new Date().toISOString() })
    .eq("conversation_id", id)
    .is("read_at", null)
    .neq("sender_id", user.id);

  const otherUserId =
    conversation.buyer_id === user.id
      ? conversation.seller_id
      : conversation.buyer_id;

  const isSeller = user.id === conversation.seller_id;

  const [{ data: otherProfile }, { data: listing }, { data: messages }, { data: offers }] =
    await Promise.all([
      supabase.from("profiles").select("username").eq("id", otherUserId).single(),
      conversation.listing_id
        ? supabase
            .from("listings")
            .select("id, brand, model, nickname")
            .eq("id", conversation.listing_id)
            .single()
        : Promise.resolve({ data: null }),
      supabase
        .from("messages")
        .select("id, conversation_id, sender_id, content, created_at")
        .eq("conversation_id", id)
        .order("created_at", { ascending: true }),
      supabase
        .from("offers")
        .select(
          "id, conversation_id, listing_id, seller_id, buyer_id, amount_cents, status, expires_at, created_at"
        )
        .eq("conversation_id", id)
        .order("created_at", { ascending: true }),
    ]);

  const threadItems = [
    ...((messages ?? []).map((message) => ({
      type: "message" as const,
      ...message,
    })) as MessageItem[]),
    ...((offers ?? []).map((offer) => ({
      type: "offer" as const,
      ...offer,
    })) as OfferItem[]),
  ].sort(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  return (
    <main className="relay-page">
      <div className="relay-site-bg" />
      <div className="relay-page-shell">
        <div className="mx-auto max-w-5xl">
          <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="relay-eyebrow">Relay</p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                Conversation with @{otherProfile?.username ?? "unknown-user"}
              </h1>

              {listing && (
                <p className="mt-2 text-sm text-white/60 sm:text-base">
                  About: {listing.brand} {listing.model}
                  {listing.nickname ? ` · ${listing.nickname}` : ""}
                </p>
              )}
            </div>

            <div className="grid w-full gap-3 sm:flex sm:w-auto sm:flex-wrap">
              <Link href="/messages" className="relay-button-secondary">
                Back to Inbox
              </Link>

              {listing && (
                <Link href={`/listings/${listing.id}`} className="relay-button-primary">
                  View Listing
                </Link>
              )}
            </div>
          </div>

          <div className="space-y-5 sm:space-y-6">
            {isSeller && conversation.listing_id && (
              <SendOfferForm
                conversationId={conversation.id}
                listingId={conversation.listing_id}
                sellerId={conversation.seller_id}
                buyerId={conversation.buyer_id}
              />
            )}

            <ChatThread
              conversationId={id}
              currentUserId={user.id}
              initialItems={threadItems}
            />
          </div>
        </div>
      </div>
    </main>
  );
}