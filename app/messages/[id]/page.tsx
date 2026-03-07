import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ChatThread from "@/app/components/chat-thread";

type MessagePageProps = {
  params: Promise<{
    id: string;
  }>;
};

type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
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

  const otherUserId =
    conversation.buyer_id === user.id
      ? conversation.seller_id
      : conversation.buyer_id;

  const [{ data: otherProfile }, { data: listing }, { data: messages }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("username")
        .eq("id", otherUserId)
        .single(),
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
    ]);

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-12 text-slate-900">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">
              Relay
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">
              Conversation with @{otherProfile?.username ?? "unknown-user"}
            </h1>

            {listing && (
              <p className="mt-2 text-slate-600">
                About: {listing.brand} {listing.model}
                {listing.nickname ? ` · ${listing.nickname}` : ""}
              </p>
            )}
          </div>

          <div className="flex gap-3">
            <Link
              href="/messages"
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100"
            >
              Back to Inbox
            </Link>

            {listing && (
              <Link
                href={`/listings/${listing.id}`}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                View Listing
              </Link>
            )}
          </div>
        </div>

        <ChatThread
          conversationId={id}
          currentUserId={user.id}
          initialMessages={(messages ?? []) as Message[]}
        />
      </div>
    </main>
  );
}