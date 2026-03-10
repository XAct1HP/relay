import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type ConversationRow = {
  id: string;
  buyer_id: string;
  seller_id: string;
  listing_id: string | null;
  created_at: string;
  updated_at: string;
};

type ProfileRow = {
  username: string;
};

type ListingRow = {
  brand: string;
  model: string;
  nickname: string | null;
};

export default async function MessagesPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const { data: conversations, error } = await supabase
    .from("conversations")
    .select("id, buyer_id, seller_id, listing_id, created_at, updated_at")
    .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`)
    .order("updated_at", { ascending: false });

  if (error) {
    return (
      <main className="relay-page">
        <div className="relay-site-bg" />
        <div className="relay-page-shell">
          <div className="mx-auto max-w-5xl">
            <p className="text-white">Failed to load inbox: {error.message}</p>
          </div>
        </div>
      </main>
    );
  }

  const typedConversations = (conversations ?? []) as ConversationRow[];

  const rows = await Promise.all(
    typedConversations.map(async (conversation) => {
      const otherUserId =
        conversation.buyer_id === user.id ? conversation.seller_id : conversation.buyer_id;

      const [{ data: otherProfile }, { data: listing }, { data: latestMessage }] =
        await Promise.all([
          supabase.from("profiles").select("username").eq("id", otherUserId).single(),
          conversation.listing_id
            ? supabase
                .from("listings")
                .select("brand, model, nickname")
                .eq("id", conversation.listing_id)
                .single()
            : Promise.resolve({ data: null }),
          supabase
            .from("messages")
            .select("content, created_at")
            .eq("conversation_id", conversation.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);

      return {
        conversation,
        otherProfile: (otherProfile ?? null) as ProfileRow | null,
        listing: (listing ?? null) as ListingRow | null,
        latestMessage: latestMessage ?? null,
      };
    })
  );

  return (
    <main className="relay-page">
      <div className="relay-site-bg" />
      <div className="relay-page-shell">
        <div className="mx-auto max-w-5xl">
          <p className="relay-eyebrow">Relay</p>
          <h1 className="relay-title">Inbox</h1>
          <p className="relay-subtitle">Manage buyer and seller conversations.</p>

          <div className="mt-8 space-y-4">
            {rows.length === 0 ? (
              <div className="relay-empty">
                <p>No conversations yet.</p>
              </div>
            ) : (
              rows.map(({ conversation, otherProfile, listing, latestMessage }) => (
                <Link
                  key={conversation.id}
                  href={`/messages/${conversation.id}`}
                  className="block rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-5 text-white shadow-[0_10px_40px_rgba(0,0,0,0.18)] backdrop-blur-xl transition hover:bg-white/[0.055]"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-lg font-semibold text-white">
                        @{otherProfile?.username ?? "unknown-user"}
                      </h2>

                      {listing && (
                        <p className="mt-1 text-sm text-white/60">
                          {listing.brand} {listing.model}
                          {listing.nickname ? ` · ${listing.nickname}` : ""}
                        </p>
                      )}

                      <p className="mt-3 text-sm text-white/50">
                        {latestMessage?.content ?? "No messages yet."}
                      </p>
                    </div>

                    <p className="text-xs text-white/40">
                      {new Date(conversation.updated_at).toLocaleDateString()}
                    </p>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>
    </main>
  );
}