"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
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
    status: "pending" | "accepted" | "declined";
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
  isBuyer,
  isSender,
}: {
  offer: {
    originalPrice: number;
    offerPrice: number;
    size: string;
    listingName: string;
    status: "pending" | "accepted" | "declined";
  };
  isBuyer: boolean;
  isSender: boolean;
}) {
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

      {isSender ? (
        <div className="flex items-center gap-2 text-xs font-semibold">
          {offer.status === "accepted" && (
            <>
              <Check className="w-4 h-4 text-green-400" />
              <span className="text-green-400">Accepted</span>
            </>
          )}
          {offer.status === "declined" && (
            <>
              <X className="w-4 h-4 text-red-400" />
              <span className="text-red-400">Declined</span>
            </>
          )}
          {offer.status === "pending" && (
            <span className="text-relay-accent">Pending</span>
          )}
        </div>
      ) : (
        <div className="flex gap-2">
          <button className="flex-1 bg-green-500/20 hover:bg-green-500/30 text-green-400 py-2 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1.5">
            <Check className="w-3.5 h-3.5" />
            Accept
          </button>
          <button className="flex-1 bg-red-500/20 hover:bg-red-500/30 text-red-400 py-2 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1.5">
            <X className="w-3.5 h-3.5" />
            Decline
          </button>
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
  const conversationId = params.id as string;
  const { currentUser } = useAuth();
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [showOfferModal, setShowOfferModal] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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

      // Fetch messages for this conversation with realtime subscription
      const { data: messagesData } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });

      // Convert messages to UI format
      const messages: Message[] = (messagesData || []).map((msg: any) => ({
        id: msg.id,
        sender: msg.sender_id === currentUser?.id ? "user" : "other",
        content: msg.content || "",
        timestamp: new Date(msg.created_at),
        type: msg.type || "text",
        offer: msg.offer,
      }));

      // Get other user info
      const otherUserId = convData.user1_id === currentUser?.id ? convData.user2_id : convData.user1_id;
      const { data: otherUserData } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", otherUserId)
        .single();

      const conv: Conversation = {
        id: convData.id,
        name: otherUserData?.display_name || "Unknown",
        avatar: (otherUserData?.display_name || "U").substring(0, 2).toUpperCase(),
        isVerified: otherUserData?.is_verified || false,
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
                      isBuyer={msg.sender !== "user"}
                      isSender={msg.sender === "user"}
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
      </div>

      {/* Custom Offer Modal */}
      {showOfferModal && (
        <CustomOfferModal
          onClose={() => setShowOfferModal(false)}
          conversation={conversation}
        />
      )}
    </div>
  );
}
