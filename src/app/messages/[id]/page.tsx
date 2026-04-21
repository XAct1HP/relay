"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { Send, Search, Tag, DollarSign, Check, X, MoreVertical, ArrowLeft } from "lucide-react";
import { CustomOfferModal } from "@/components/messages/CustomOfferModal";
import Link from "next/link";

interface Message {
  id: string;
  sender: "user" | "other";
  content: string;
  timestamp: Date;
  type: "text" | "offer";
  offer?: {
    originalPrice: number;
    offerPrice: number;
    size: string;
    listingName: string;
    listingId: string;
    customOfferId: string;
    status: "pending" | "accepted" | "declined";
    messageId: string;
  };
}

interface Conversation {
  id: string;
  name: string;
  avatar: string;
  isVerified: boolean;
  lastMessage: string;
  time: string;
  unread: boolean;
  messages: Message[];
  relatedListing?: {
    id: string;
    name: string;
    image: string;
  };
}

function Avatar({ initials }: { initials: string }) {
  return (
    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#5f8fff] to-[#7ca6ff] flex items-center justify-center text-sm font-semibold text-white flex-shrink-0">
      {initials}
    </div>
  );
}

function OfferCard({
  offer,
  isSender,
  onAccept,
  onDecline,
  onGoToCheckout,
}: {
  offer: {
    originalPrice: number;
    offerPrice: number;
    size: string;
    listingName: string;
    listingId: string;
    customOfferId: string;
    status: "pending" | "accepted" | "declined";
    messageId: string;
  };
  isSender: boolean;
  onAccept?: () => void;
  onDecline?: () => void;
  onGoToCheckout?: () => void;
}) {
  const isPending = offer.status === "pending";
  const isAccepted = offer.status === "accepted";
  const isDeclined = offer.status === "declined";

  return (
    <div className="bg-relay-accent-strong/15 border border-relay-accent-strong/30 rounded-2xl p-4 max-w-sm">
      <div className="flex items-center gap-2 mb-3">
        <Tag className="w-4 h-4 text-relay-accent" />
        <span className="text-xs font-semibold text-relay-accent uppercase tracking-wider">
          Custom Offer
        </span>
      </div>

      <h4 className="text-sm font-semibold text-relay-text mb-2">{offer.listingName}</h4>

      <div className="space-y-2 mb-4 pb-4 border-b border-relay-accent/20">
        <div className="flex justify-between items-center text-xs">
          <span className="text-white/60">Size</span>
          <span className="text-relay-text font-medium">{offer.size}</span>
        </div>
        <div className="flex justify-between items-center text-xs">
          <span className="text-white/60">Original Price</span>
          <span className="text-relay-text line-through">${offer.originalPrice.toFixed(2)}</span>
        </div>
        <div className="flex justify-between items-center text-sm">
          <span className="text-white/60">Offer Price</span>
          <span className="text-relay-accent font-semibold">${offer.offerPrice.toFixed(2)}</span>
        </div>
      </div>

      {/* Pending — show Accept/Decline for receiver, "Pending" for sender */}
      {isPending && isSender && (
        <div className="flex items-center gap-2 text-xs font-semibold">
          <span className="text-relay-accent">Pending</span>
        </div>
      )}
      {isPending && !isSender && (
        <div className="flex gap-2">
          <button
            onClick={onAccept}
            className="flex-1 bg-green-500/20 hover:bg-green-500/30 text-green-400 py-2 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
          >
            <Check className="w-3.5 h-3.5" />
            Accept
          </button>
          <button
            onClick={onDecline}
            className="flex-1 bg-red-500/20 hover:bg-red-500/30 text-red-400 py-2 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
          >
            <X className="w-3.5 h-3.5" />
            Decline
          </button>
        </div>
      )}

      {/* Accepted — show status + "Go to Checkout" for receiver */}
      {isAccepted && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <Check className="w-4 h-4 text-green-400" />
            <span className="text-green-400">Accepted</span>
          </div>
          {!isSender && onGoToCheckout && (
            <button
              onClick={onGoToCheckout}
              className="w-full bg-relay-accent-strong/20 hover:bg-relay-accent-strong/30 text-relay-accent py-2.5 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
            >
              <DollarSign className="w-3.5 h-3.5" />
              Go to Checkout
            </button>
          )}
        </div>
      )}

      {/* Declined */}
      {isDeclined && (
        <div className="flex items-center gap-2 text-xs font-semibold">
          <X className="w-4 h-4 text-red-400" />
          <span className="text-red-400">Declined</span>
        </div>
      )}
    </div>
  );
}

function MessageCircle({ className }: { className: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
      />
    </svg>
  );
}

export default function ConversationPage() {
  const params = useParams();
  const router = useRouter();
  const conversationId = params.id as string;
  const { currentUser } = useAuth();
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [showOfferModal, setShowOfferModal] = useState(false);
  const [loading, setLoading] = useState(true);

  const handleAcceptOffer = async (offer: Message["offer"]) => {
    console.log("[ACCEPT] called with offer:", JSON.stringify(offer));
    console.log("[ACCEPT] currentUser:", currentUser?.id);
    if (!offer || !currentUser?.id) {
      console.log("[ACCEPT] bailing — offer or user missing");
      return;
    }

    // 1. Optimistic UI update FIRST — card switches to "Accepted" + "Go to Checkout" instantly
    setConversation((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        messages: prev.messages.map((m) =>
          m.offer?.messageId === offer.messageId
            ? { ...m, offer: { ...m.offer!, status: "accepted" as const } }
            : m
        ),
      };
    });
    console.log("[ACCEPT] local state updated");

    // 2. Then update DB in the background
    try {
      const supabase = createClient();

      const { error: msgErr } = await supabase
        .from("messages")
        .update({ custom_offer_status: "accepted" })
        .eq("id", offer.messageId);
      console.log("[ACCEPT] message update result:", msgErr ? msgErr.message : "ok");

      if (offer.customOfferId) {
        const { error: offerErr } = await supabase
          .from("custom_offers")
          .update({ status: "accepted" })
          .eq("id", offer.customOfferId);
        console.log("[ACCEPT] custom_offers update result:", offerErr ? offerErr.message : "ok");
      }
    } catch (error) {
      console.error("[ACCEPT] DB error:", error);
    }
  };

  const handleGoToCheckout = (offer: Message["offer"]) => {
    console.log("[CHECKOUT] called with offer:", JSON.stringify(offer));
    if (!offer) return;

    const url = `/checkout?listing=${encodeURIComponent(offer.listingId)}&size=${encodeURIComponent(offer.size)}&price=${encodeURIComponent(offer.offerPrice.toString())}&customOffer=${encodeURIComponent(offer.customOfferId || "true")}`;
    console.log("[CHECKOUT] navigating to:", url);

    // Use window.location for guaranteed navigation
    window.location.href = url;
  };

  const handleDeclineOffer = async (offer: Message["offer"]) => {
    if (!offer || !currentUser?.id) return;

    try {
      const res = await fetch("/api/offers/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          messageId: offer.messageId,
          action: "decline",
          conversationId,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to decline offer");
      }

      // Update local state
      setConversation((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          messages: prev.messages.map((m) =>
            m.offer?.messageId === offer.messageId
              ? { ...m, offer: { ...m.offer!, status: "declined" as const } }
              : m
          ),
        };
      });
    } catch (error) {
      console.error("Error declining offer:", error);
      alert("Failed to decline offer. Please try again.");
    }
  };

  useEffect(() => {
    if (!currentUser?.id) return;

    async function loadConversation() {
      const supabase = createClient();

      // Fetch conversation metadata
      const { data: convData } = await supabase
        .from("conversations")
        .select("*")
        .eq("id", conversationId)
        .single();

      if (!convData) {
        setLoading(false);
        return;
      }

      // Fetch messages for this conversation
      const { data: messagesData } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });

      // Fetch custom offers for this conversation to get listing details
      const { data: customOffers } = await supabase
        .from("custom_offers")
        .select("*, listings(id, brand, model, nickname)")
        .eq("conversation_id", conversationId);

      const offersMap = new Map<string, any>();
      (customOffers || []).forEach((co: any) => {
        offersMap.set(co.id, co);
      });

      // Convert messages to UI format
      const messages: Message[] = (messagesData || []).map((msg: any) => {
        const isOffer = msg.message_type === "custom_offer";
        let offer: Message["offer"] | undefined;

        if (isOffer) {
          // Find the matching custom offer for listing details
          const matchingOffer = Array.from(offersMap.values()).find(
            (co: any) =>
              co.conversation_id === conversationId &&
              co.sender_id === msg.sender_id &&
              co.offer_price === msg.custom_offer_price &&
              co.size === msg.custom_offer_size
          );

          const listing = matchingOffer?.listings;
          const listingName = listing
            ? `${listing.brand} ${listing.model}${listing.nickname ? ` "${listing.nickname}"` : ""}`
            : msg.content?.replace("Custom offer: ", "") || "Custom Offer";

          offer = {
            originalPrice: matchingOffer?.original_price || 0,
            offerPrice: msg.custom_offer_price || 0,
            size: msg.custom_offer_size || "",
            listingName,
            listingId: matchingOffer?.listing_id || "",
            customOfferId: matchingOffer?.id || "",
            status: msg.custom_offer_status || "pending",
            messageId: msg.id,
          };
        }

        return {
          id: msg.id,
          sender: msg.sender_id === currentUser?.id ? "user" : "other",
          content: msg.content || "",
          timestamp: new Date(msg.created_at),
          type: isOffer ? "offer" : "text",
          offer,
        };
      });

      // Get other user info — conversations use participant_ids array
      const participantIds: string[] = convData.participant_ids || [];
      const otherUserId = participantIds.find((pid: string) => pid !== currentUser?.id);
      let otherUserData: any = null;
      if (otherUserId) {
        const { data } = await supabase
          .from("profiles")
          .select("id, display_name, full_name, avatar_url, is_verified_seller")
          .eq("id", otherUserId)
          .maybeSingle();
        otherUserData = data;
      }

      const conv: Conversation = {
        id: convData.id,
        name: otherUserData?.display_name || "Unknown",
        avatar: (otherUserData?.display_name || "U").substring(0, 2).toUpperCase(),
        isVerified: otherUserData?.is_verified_seller || false,
        lastMessage: messagesData?.[messagesData.length - 1]?.content || "",
        time: messagesData?.length ? new Date(messagesData[messagesData.length - 1].created_at).toLocaleTimeString() : "",
        unread: convData.unread,
        messages,
        relatedListing: convData.listing_id ? {
          id: convData.listing_id,
          name: "Related Listing",
          image: "listing",
        } : undefined,
      };

      setConversation(conv);
      setLoading(false);
    }

    loadConversation();

    // Subscribe to realtime updates
    const supabase = createClient();
    const subscription = supabase
      .channel(`messages:${conversationId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` }, () => {
        loadConversation();
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [conversationId, currentUser?.id]);

  if (loading) {
    return (
      <div className="text-center py-12">
        <p className="text-white/40">Loading conversation...</p>
      </div>
    );
  }

  if (!conversation) {
    return (
      <div>
          <div className="flex items-center gap-4 mb-8">
            <Link href="/messages">
              <button className="p-2 hover:bg-white/5 rounded-lg transition-colors">
                <ArrowLeft className="w-5 h-5 text-white/60" />
              </button>
            </Link>
            <div>
              <p className="relay-eyebrow text-relay-accent mb-2">CONVERSATION</p>
              <h1 className="relay-title">Not Found</h1>
            </div>
          </div>

          <div className="relay-card p-12 text-center">
            <MessageCircle className="w-16 h-16 text-white/20 mx-auto mb-4" />
            <p className="text-white/60">This conversation does not exist</p>
            <Link href="/messages">
              <button className="relay-button-accent mt-6">Back to Messages</button>
            </Link>
          </div>
        </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link href="/messages">
            <button className="p-2 hover:bg-white/5 rounded-lg transition-colors">
              <ArrowLeft className="w-5 h-5 text-white/60" />
            </button>
          </Link>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Avatar initials={conversation.avatar} />
              <div>
                <div className="flex items-center gap-1.5">
                  <p className="font-semibold text-relay-text">{conversation.name}</p>
                  {conversation.isVerified && (
                    <svg
                      className="w-4 h-4 text-relay-accent"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </div>
                {conversation.relatedListing && (
                  <p className="text-xs text-white/50 mt-0.5">{conversation.relatedListing.name}</p>
                )}
              </div>
            </div>
          </div>

          <button className="p-2 hover:bg-white/5 rounded-lg transition-colors">
            <MoreVertical className="w-5 h-5 text-white/40" />
          </button>
        </div>

        {/* Messages */}
        <div className="relay-card p-6 space-y-4 max-h-[500px] overflow-y-auto relay-scrollbar">
          {conversation.messages.map((msg, idx) => {
            const showTimestamp =
              idx === 0 ||
              new Date(conversation.messages[idx - 1].timestamp).getTime() -
                new Date(msg.timestamp).getTime() >
                600000;

            return (
              <div key={msg.id}>
                {showTimestamp && (
                  <div className="flex justify-center mb-4">
                    <p className="text-xs text-white/40">
                      {msg.timestamp.toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                )}

                {msg.type === "offer" && msg.offer ? (
                  <div
                    className={`flex ${msg.sender === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <OfferCard
                      offer={msg.offer}
                      isSender={msg.sender === "user"}
                      onAccept={() => handleAcceptOffer(msg.offer)}
                      onDecline={() => handleDeclineOffer(msg.offer)}
                      onGoToCheckout={() => handleGoToCheckout(msg.offer)}
                    />
                  </div>
                ) : msg.content ? (
                  <div
                    className={`flex ${msg.sender === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-xs px-4 py-2 rounded-2xl ${
                        msg.sender === "user"
                          ? "bg-relay-accent-strong/20 text-relay-text"
                          : "bg-white/[0.06] text-relay-text"
                      }`}
                    >
                      <p className="text-sm">{msg.content}</p>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        {/* Input area */}
        <div className="relay-card p-6 space-y-3">
          <div className="flex gap-3">
            <input
              type="text"
              placeholder="Type your message..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === "Enter" && inputValue.trim()) {
                  setInputValue("");
                }
              }}
              className="relay-input flex-1"
            />
            <button className="relay-button-accent px-4 flex items-center gap-2">
              <Send className="w-4 h-4" />
              <span className="hidden sm:inline">Send</span>
            </button>
          </div>

          <button
            onClick={() => setShowOfferModal(true)}
            className="relay-button-secondary w-full flex items-center justify-center gap-2"
          >
            <DollarSign className="w-4 h-4" />
            Send Custom Offer
          </button>
        </div>

      {/* Custom Offer Modal */}
      {showOfferModal && (
        <CustomOfferModal
          onClose={() => setShowOfferModal(false)}
          conversationId={conversation.id}
          recipientName={conversation.name}
          onOfferSent={(_convId: string, _offerMessage: any) => {
            setShowOfferModal(false);
          }}
        />
      )}
    </div>
  );
}

      {/* Custom Offer Modal */}
      {showOfferModal && (
        <CustomOfferModal
          onClose={() => setShowOfferModal(false)}
          conversationId={conversation.id}
          recipientName={conversation.name}
          onOfferSent={(_convId: string, _offerMessage: any) => {
            setShowOfferModal(false);
          }}
        />
      )}
    </div>
  );
}
ame="w-4 h-4" />
            Send Custom Offer
          </button>
        </div>

      {/* Custom Offer Modal */}
      {showOfferModal && (
        <CustomOfferModal
          onClose={() => setShowOfferModal(false)}
          conversationId={conversation.id}
          recipientName={conversation.name}
          onOfferSent={(_convId: string, _offerMessage: any) => {
            setShowOfferModal(false);
          }}
        />
      )}
    </div>
  );
}
