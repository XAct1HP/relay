"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Check, DollarSign, MoreVertical, Send, Tag, X } from "lucide-react";
import { CustomOfferModal } from "@/components/messages/CustomOfferModal";
import { formatOfferListingName } from "@/lib/offers";
import { getBuyerMessagingUnavailableReason } from "@/lib/seller-availability";
import { createClient } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";

interface OfferDetails {
  originalPrice: number;
  offerPrice: number;
  size: string;
  listingName: string;
  listingId: string;
  listingVariantId?: string;
  customOfferId: string;
  status: "pending" | "accepted" | "declined";
  messageId: string;
}

interface Message {
  id: string;
  sender: "user" | "other";
  content: string;
  timestamp: Date;
  type: "text" | "offer";
  offer?: OfferDetails;
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
  otherUserRole?: "buyer" | "seller" | "admin";
  customerMessagingEnabled?: boolean;
  vacationModeEnabled?: boolean;
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
  offer: OfferDetails;
  isSender: boolean;
  onAccept?: () => void;
  onDecline?: () => void;
  onGoToCheckout?: () => void;
}) {
  const isPending = offer.status === "pending";
  const isAccepted = offer.status === "accepted";
  const isDeclined = offer.status === "declined";

  return (
    <div className="bg-relay-accent-strong/15 border border-relay-accent-strong/30 rounded-2xl p-4 max-w-[calc(100vw-4rem)] sm:max-w-sm">
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
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
  const conversationId = params.id as string;
  const { currentUser } = useAuth();
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [showOfferModal, setShowOfferModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const canSendOffers =
    (currentUser?.role === "seller" || currentUser?.role === "admin") &&
    !!currentUser?.offers_enabled;

  const loadConversation = async () => {
    if (!currentUser?.id) return;

    const supabase = createClient();
    const { data: convData } = await supabase
      .from("conversations")
      .select("*")
      .eq("id", conversationId)
      .single();

    if (!convData) {
      setLoading(false);
      return;
    }

    const { data: messagesData } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    const { data: customOffers } = await supabase
      .from("custom_offers")
      .select("*, listings(id, brand, model, nickname, sku)")
      .eq("conversation_id", conversationId);

    const offers = customOffers || [];
    const messages: Message[] = (messagesData || []).map((msg: any) => {
      const isOffer = msg.message_type === "custom_offer";
      let offer: OfferDetails | undefined;

      if (isOffer) {
        const matchingOffer = offers.find(
          (co: any) =>
            co.conversation_id === conversationId &&
            co.sender_id === msg.sender_id &&
            co.offer_price === msg.custom_offer_price &&
            co.size === msg.custom_offer_size
        );

        const listing = matchingOffer?.listings;
        const listingName = listing
          ? formatOfferListingName(listing)
          : msg.content?.replace("Custom offer: ", "") || "Custom Offer";

        offer = {
          originalPrice: Number(matchingOffer?.original_price) || 0,
          offerPrice: Number(msg.custom_offer_price) || 0,
          size: msg.custom_offer_size || "",
          listingName,
          listingId: matchingOffer?.listing_id || "",
          listingVariantId: matchingOffer?.listing_variant_id || undefined,
          customOfferId: matchingOffer?.id || "",
          status: msg.custom_offer_status || "pending",
          messageId: msg.id,
        };
      }

      return {
        id: msg.id,
        sender: msg.sender_id === currentUser.id ? "user" : "other",
        content: msg.content || "",
        timestamp: new Date(msg.created_at),
        type: isOffer ? "offer" : "text",
        offer,
      };
    });

    const participantIds: string[] = convData.participant_ids || [];
    const otherUserId = participantIds.find((pid: string) => pid !== currentUser.id);
    let otherUserData: any = null;
    if (otherUserId) {
      const { data } = await supabase
        .from("profiles")
        .select("id, display_name, full_name, avatar_url, role, is_verified_seller, customer_messaging_enabled, vacation_mode_enabled")
        .eq("id", otherUserId)
        .maybeSingle();
      otherUserData = data;
    }

    setConversation({
      id: convData.id,
      name: otherUserData?.display_name || "Unknown",
      avatar: (otherUserData?.display_name || "U").substring(0, 2).toUpperCase(),
      isVerified: otherUserData?.is_verified_seller || false,
      lastMessage: messagesData?.[messagesData.length - 1]?.content || "",
      time: messagesData?.length
        ? new Date(messagesData[messagesData.length - 1].created_at).toLocaleTimeString()
        : "",
      unread: convData.unread,
      messages,
      otherUserRole: otherUserData?.role,
      customerMessagingEnabled: !!otherUserData?.customer_messaging_enabled,
      vacationModeEnabled: !!otherUserData?.vacation_mode_enabled,
      relatedListing: convData.listing_id
        ? {
            id: convData.listing_id,
            name: "Related Listing",
            image: "listing",
          }
        : undefined,
    });
    setLoading(false);
  };

  const updateOfferStatusInState = (
    offer: OfferDetails,
    nextStatus: "pending" | "accepted" | "declined",
    listingVariantId?: string,
    customOfferId?: string
  ) => {
    setConversation((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        messages: prev.messages.map((m) =>
          m.offer?.messageId === offer.messageId
            ? {
                ...m,
                offer: {
                  ...m.offer!,
                  status: nextStatus,
                  listingVariantId: listingVariantId || m.offer?.listingVariantId,
                  customOfferId: customOfferId || m.offer?.customOfferId || "",
                },
              }
            : m
        ),
      };
    });
  };

  const handleAcceptOffer = async (offer: OfferDetails | undefined) => {
    if (!offer || !currentUser?.id) return;

    updateOfferStatusInState(offer, "accepted");

    try {
      const res = await fetch("/api/offers/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          messageId: offer.messageId,
          action: "accept",
          conversationId,
          customOfferId: offer.customOfferId,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to accept offer");
      }

      updateOfferStatusInState(
        offer,
        "accepted",
        data.listingVariantId || offer.listingVariantId,
        data.customOfferId || offer.customOfferId
      );
    } catch (error: any) {
      console.error("Error accepting offer:", error);
      updateOfferStatusInState(offer, "pending");
      alert(error?.message || "Failed to accept offer. Please try again.");
    }
  };

  const handleDeclineOffer = async (offer: OfferDetails | undefined) => {
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
          customOfferId: offer.customOfferId,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to decline offer");
      }

      updateOfferStatusInState(offer, "declined", offer.listingVariantId, data.customOfferId || offer.customOfferId);
    } catch (error) {
      console.error("Error declining offer:", error);
      alert("Failed to decline offer. Please try again.");
    }
  };

  const handleGoToCheckout = (offer: OfferDetails | undefined) => {
    if (!offer) return;

    const variantParam = offer.listingVariantId
      ? `&variant=${encodeURIComponent(offer.listingVariantId)}`
      : "";
    const url = `/checkout?listing=${encodeURIComponent(offer.listingId)}&size=${encodeURIComponent(offer.size)}${variantParam}&customOffer=${encodeURIComponent(offer.customOfferId || "true")}`;
    window.location.href = url;
  };

  useEffect(() => {
    if (!currentUser?.id) return;

    loadConversation();

    const supabase = createClient();
    const subscription = supabase
      .channel(`messages:${conversationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        () => {
          loadConversation();
        }
      )
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

  const messagingDisabledReason =
    currentUser?.role === "buyer"
      ? getBuyerMessagingUnavailableReason({
          role: conversation.otherUserRole,
          customerMessagingEnabled: conversation.customerMessagingEnabled,
          vacationModeEnabled: conversation.vacationModeEnabled,
        })
      : null;

  return (
    <div className="space-y-6 pb-12">
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
                  <svg className="w-4 h-4 text-relay-accent" fill="currentColor" viewBox="0 0 20 20">
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

      <div className="relay-card p-3 sm:p-6 space-y-4 max-h-[calc(100vh-380px)] sm:max-h-[500px] overflow-y-auto relay-scrollbar">
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
                <div className={`flex ${msg.sender === "user" ? "justify-end" : "justify-start"}`}>
                  <OfferCard
                    offer={msg.offer}
                    isSender={msg.sender === "user"}
                    onAccept={() => handleAcceptOffer(msg.offer)}
                    onDecline={() => handleDeclineOffer(msg.offer)}
                    onGoToCheckout={() => handleGoToCheckout(msg.offer)}
                  />
                </div>
              ) : msg.content ? (
                <div className={`flex ${msg.sender === "user" ? "justify-end" : "justify-start"}`}>
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

      <div className="relay-card p-3 sm:p-6 space-y-3">
        {messagingDisabledReason && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2">
            <p className="text-sm text-amber-200">{messagingDisabledReason}</p>
          </div>
        )}
        <div className="flex gap-2 sm:gap-3">
          <input
            type="text"
            placeholder="Type your message..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            disabled={!!messagingDisabledReason}
            onKeyPress={(e) => {
              if (e.key === "Enter" && inputValue.trim()) {
                setInputValue("");
              }
            }}
            className="relay-input flex-1"
          />
          <button disabled={!!messagingDisabledReason} className="relay-button-accent px-3 sm:px-4 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
            <Send className="w-4 h-4" />
            <span className="hidden sm:inline">Send</span>
          </button>
        </div>

        {canSendOffers && (
          <button
            onClick={() => setShowOfferModal(true)}
            className="relay-button-secondary w-full flex items-center justify-center gap-2"
          >
            <DollarSign className="w-4 h-4" />
            Send Custom Offer
          </button>
        )}
      </div>

      {showOfferModal && (
        <CustomOfferModal
          onClose={() => setShowOfferModal(false)}
          conversationId={conversation.id}
          recipientName={conversation.name}
          onOfferSent={(_convId: string, _offerMessage: any) => {
            setShowOfferModal(false);
            loadConversation();
          }}
        />
      )}
    </div>
  );
}
