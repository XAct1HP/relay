"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

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
        (payload) => {
          const newMessage = payload.new as Omit<MessageItem, "type">;

          setItems((current) => {
            if (current.some((item) => item.type === "message" && item.id === newMessage.id)) {
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
            if (current.some((item) => item.type === "offer" && item.id === newOffer.id)) {
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
  }, [conversationId, supabase]);

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

  async function acceptOffer(offerId: string) {
    setLoadingOfferId(offerId);
    setMessage("");

    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ offerId }),
    });

    const data = await res.json();

    if (!res.ok) {
      setMessage(data.error || "Failed to start checkout for this offer.");
      setLoadingOfferId(null);
      return;
    }

    if (data.url) {
      window.location.href = data.url;
      return;
    }

    setMessage("Checkout URL was not returned.");
    setLoadingOfferId(null);
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
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="max-h-[600px] space-y-4 overflow-y-auto p-6">
        {items.length === 0 ? (
          <p className="text-sm text-slate-500">No messages yet. Start the conversation.</p>
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
                    className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm ${
                      isOwn
                        ? "bg-slate-900 text-white"
                        : "bg-slate-100 text-slate-900"
                    }`}
                  >
                    <p>{item.content}</p>
                    <p
                      className={`mt-2 text-[11px] ${
                        isOwn ? "text-slate-300" : "text-slate-500"
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
                <div className="max-w-[85%] rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-xs font-medium uppercase tracking-[0.15em] text-slate-500">
                    Seller Offer
                  </p>

                  <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
                    ${(item.amount_cents / 100).toFixed(2)}
                  </p>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                      Status: {item.status}
                    </span>

                    {item.expires_at && (
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                        Expires: {new Date(item.expires_at).toLocaleString()}
                      </span>
                    )}
                  </div>

                  {isExpired && isPending && (
                    <p className="mt-3 text-sm font-medium text-amber-600">
                      This offer has expired.
                    </p>
                  )}

                  {isBuyer && isPending && !isExpired && (
                    <div className="mt-4 flex flex-wrap gap-3">
                      <button
                        type="button"
                        disabled={loadingOfferId === item.id}
                        onClick={() => acceptOffer(item.id)}
                        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                      >
                        {loadingOfferId === item.id ? "Redirecting..." : "Accept Offer"}
                      </button>

                      <button
                        type="button"
                        disabled={loadingOfferId === item.id}
                        onClick={() => updateOfferStatus(item.id, "rejected")}
                        className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100 disabled:opacity-50"
                      >
                        Decline
                      </button>
                    </div>
                  )}

                  {isSeller && (
                    <p className="mt-4 text-sm text-slate-500">
                      {item.status === "pending" && "Waiting for buyer response"}
                      {item.status === "accepted" && "Buyer accepted this offer"}
                      {item.status === "rejected" && "Buyer declined this offer"}
                      {item.status === "expired" && "Offer expired"}
                      {item.status === "cancelled" && "Offer cancelled"}
                    </p>
                  )}

                  <p className="mt-3 text-[11px] text-slate-500">
                    {new Date(item.created_at).toLocaleString()}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSend} className="border-t border-slate-200 p-4">
        <div className="flex gap-3">
          <input
            type="text"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Send a message..."
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
          />
          <button
            type="submit"
            disabled={sending}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {sending ? "Sending..." : "Send"}
          </button>
        </div>

        {message && <p className="mt-3 text-sm text-slate-600">{message}</p>}
      </form>
    </div>
  );
}