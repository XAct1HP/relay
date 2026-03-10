"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type MessageItem = {
  type: "message";
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  read_at?: string | null;
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

type ThreadItem = MessageItem | OfferItem;

type ChatThreadProps = {
  conversationId: string;
  currentUserId: string;
  initialItems: ThreadItem[];
};

export default function ChatThread({
  conversationId,
  currentUserId,
  initialItems,
}: ChatThreadProps) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [items, setItems] = useState<ThreadItem[]>(initialItems);
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const [loadingOfferId, setLoadingOfferId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  function sortItems(nextItems: ThreadItem[]) {
    return [...nextItems].sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
  }

  useEffect(() => {
    setItems(sortItems(initialItems));
  }, [initialItems]);

  useEffect(() => {
    const messageChannel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload) => {
          const newMessage = payload.new as Omit<MessageItem, "type">;

          setItems((current) => {
            if (
              current.some(
                (item) => item.type === "message" && item.id === newMessage.id
              )
            ) {
              return current;
            }

            return sortItems([
              ...current,
              {
                type: "message",
                ...newMessage,
              },
            ]);
          });

          const isIncomingMessage = newMessage.sender_id !== currentUserId;

          if (isIncomingMessage && !newMessage.read_at) {
            await supabase
              .from("messages")
              .update({ read_at: new Date().toISOString() })
              .eq("id", newMessage.id)
              .is("read_at", null);
          }
        }
      )
      .subscribe();

    const offerChannel = supabase
      .channel(`offers:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "offers",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const newOffer = payload.new as Omit<OfferItem, "type">;

          setItems((current) => {
            if (
              current.some(
                (item) => item.type === "offer" && item.id === newOffer.id
              )
            ) {
              return current;
            }

            return sortItems([
              ...current,
              {
                type: "offer",
                ...newOffer,
              },
            ]);
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "offers",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const updatedOffer = payload.new as Omit<OfferItem, "type">;

          setItems((current) =>
            sortItems(
              current.map((item) =>
                item.type === "offer" && item.id === updatedOffer.id
                  ? { type: "offer", ...updatedOffer }
                  : item
              )
            )
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(messageChannel);
      supabase.removeChannel(offerChannel);
    };
  }, [conversationId, currentUserId, supabase]);

  useEffect(() => {
    let cancelled = false;

    async function upsertPresence() {
      if (cancelled) return;

      await supabase.from("conversation_views").upsert(
        {
          conversation_id: conversationId,
          profile_id: currentUserId,
          last_seen_at: new Date().toISOString(),
        },
        {
          onConflict: "conversation_id,profile_id",
        }
      );
    }

    upsertPresence();

    const interval = setInterval(() => {
      upsertPresence();
    }, 10000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [conversationId, currentUserId, supabase]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [items]);

  async function handleSend(e: FormEvent) {
    e.preventDefault();

    const trimmed = content.trim();
    if (!trimmed) return;

    setSending(true);
    setMessage("");

    const { error } = await supabase.from("messages").insert({
      conversation_id: conversationId,
      sender_id: currentUserId,
      content: trimmed,
    });

    if (error) {
      setMessage(error.message);
      setSending(false);
      return;
    }

    const { error: conversationUpdateError } = await supabase
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversationId);

    if (conversationUpdateError) {
      setMessage(conversationUpdateError.message);
      setSending(false);
      return;
    }

    setContent("");
    setSending(false);
  }

  function acceptOffer(offerId: string, listingId: string) {
    setLoadingOfferId(offerId);
    setMessage("");

    router.push(
      `/checkout/start/${listingId}?offerId=${encodeURIComponent(offerId)}`
    );
  }

  async function updateOfferStatus(offerId: string, newStatus: "rejected") {
    setLoadingOfferId(offerId);
    setMessage("");

    const { error } = await supabase
      .from("offers")
      .update({ status: newStatus })
      .eq("id", offerId);

    if (error) {
      setMessage(error.message);
      setLoadingOfferId(null);
      return;
    }

    setLoadingOfferId(null);
  }

  return (
    <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.05] shadow-[0_30px_100px_rgba(0,0,0,0.3)] backdrop-blur-2xl">
      <div className="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-4 sm:px-6">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-white/38">
            Conversation
          </p>
          <p className="mt-1 text-sm font-medium text-white">Live messages and offers</p>
        </div>
        <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-medium text-white/55">
          Real time
        </div>
      </div>

      <div className="max-h-[640px] space-y-4 overflow-y-auto px-4 py-5 sm:px-6">
        {items.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-sm text-white/50">
            No messages yet. Start the conversation.
          </div>
        ) : (
          items.map((item) => {
            if (item.type === "message") {
              const isOwn = item.sender_id === currentUserId;

              return (
                <div
                  key={`message-${item.id}`}
                  className={`flex ${isOwn ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[78%] rounded-[1.5rem] px-4 py-3 text-sm shadow-[0_10px_30px_rgba(0,0,0,0.14)] ${
                      isOwn
                        ? "border border-white/10 bg-white/[0.11] text-white"
                        : "border border-white/10 bg-[#0d1118] text-white/88"
                    }`}
                  >
                    <p className="leading-7">{item.content}</p>
                    <p
                      className={`mt-2 text-[11px] ${
                        isOwn ? "text-white/42" : "text-white/38"
                      }`}
                    >
                      {new Date(item.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              );
            }

            const isBuyer = currentUserId === item.buyer_id;
            const isSeller = currentUserId === item.seller_id;
            const isPending = item.status === "pending";
            const isExpired =
              item.expires_at && new Date(item.expires_at).getTime() < Date.now();

            return (
              <div
                key={`offer-${item.id}`}
                className={`flex ${isSeller ? "justify-end" : "justify-start"}`}
              >
                <div className="max-w-[88%] overflow-hidden rounded-[1.5rem] border border-white/10 bg-white/[0.055] shadow-[0_12px_35px_rgba(0,0,0,0.16)]">
                  <div className="border-b border-white/10 bg-black/20 px-4 py-3">
                    <p className="text-[11px] uppercase tracking-[0.2em] text-white/40">
                      Seller Offer
                    </p>
                  </div>

                  <div className="p-4">
                    <p className="text-3xl font-semibold tracking-tight text-white">
                      ${(item.amount_cents / 100).toFixed(2)}
                    </p>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs font-medium text-white/70">
                        Status: {item.status}
                      </span>

                      {item.expires_at && (
                        <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs font-medium text-white/70">
                          Expires: {new Date(item.expires_at).toLocaleString()}
                        </span>
                      )}
                    </div>

                    {isExpired && isPending && (
                      <p className="mt-3 text-sm font-medium text-amber-300/90">
                        This offer has expired.
                      </p>
                    )}

                    {isBuyer && isPending && !isExpired && (
                      <div className="mt-4 flex flex-wrap gap-3">
                        <button
                          type="button"
                          disabled={loadingOfferId === item.id}
                          onClick={() => acceptOffer(item.id, item.listing_id)}
                          className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-white/90 disabled:opacity-50"
                        >
                          {loadingOfferId === item.id
                            ? "Redirecting..."
                            : "Accept Offer"}
                        </button>

                        <button
                          type="button"
                          disabled={loadingOfferId === item.id}
                          onClick={() => updateOfferStatus(item.id, "rejected")}
                          className="rounded-full border border-white/12 bg-white/[0.05] px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/[0.08] disabled:opacity-50"
                        >
                          Decline
                        </button>
                      </div>
                    )}

                    {isSeller && (
                      <p className="mt-4 text-sm text-white/52">
                        {item.status === "pending" && "Waiting for buyer response"}
                        {item.status === "accepted" && "Buyer accepted this offer"}
                        {item.status === "rejected" && "Buyer declined this offer"}
                        {item.status === "expired" && "Offer expired"}
                        {item.status === "cancelled" && "Offer cancelled"}
                      </p>
                    )}

                    <p className="mt-3 text-[11px] text-white/38">
                      {new Date(item.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSend} className="border-t border-white/10 p-4 sm:p-5">
        <div className="flex gap-3">
          <input
            type="text"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Send a message..."
            className="flex-1 rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-3 text-white outline-none transition placeholder:text-white/30 focus:border-white/20 focus:bg-white/[0.06]"
          />
          <button
            type="submit"
            disabled={sending}
            className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-white/90 disabled:opacity-50"
          >
            {sending ? "Sending..." : "Send"}
          </button>
        </div>

        {message && <p className="mt-3 text-sm text-white/65">{message}</p>}
      </form>
    </div>
  );
}