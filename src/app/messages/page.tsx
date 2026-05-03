"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Send,
  Search,
  Tag,
  DollarSign,
  Check,
  X,
  MoreVertical,
  MessageCircle,
} from "lucide-react";
import { CustomOfferModal } from "@/components/messages/CustomOfferModal";
import { createClient } from "@/lib/supabase";
import useAuth from "@/hooks/useAuth";
import { useNotificationStore } from "@/store/notificationStore";

interface MessageData {
  id: string;
  sender_id: string;
  content: string;
  created_at: string;
  conversation_id?: string;
  message_type: "text" | "custom_offer" | "offer_accepted" | "offer_declined" | "system";
  custom_offer_price?: number;
  custom_offer_status?: "pending" | "accepted" | "declined";
  custom_offer_size?: string;
  // Client-side enrichment fields (not in DB)
  _offerListingName?: string;
  _offerOriginalPrice?: number;
  _offerListingId?: string;
  _offerCustomOfferId?: string;
}

interface ConversationData {
  id: string;
  participant_ids: string[];
  listing_id: string | null;
  last_message: string | null;
  last_message_at: string | null;
  created_at: string;
  otherUser: {
    id: string;
    display_name: string;
    full_name: string;
    avatar_url: string | null;
    is_verified_seller: boolean;
  } | null;
  messages: MessageData[];
}

function Avatar({ name, avatarUrl }: { name: string; avatarUrl?: string | null }) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className="w-10 h-10 rounded-full object-cover border border-white/10 flex-shrink-0"
      />
    );
  }
  return (
    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#5f8fff] to-[#7ca6ff] flex items-center justify-center text-sm font-semibold text-white flex-shrink-0">
      {name?.charAt(0)?.toUpperCase() || "U"}
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
    status: "pending" | "accepted" | "declined";
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

      <h4 className="text-sm font-semibold text-relay-text mb-2">
        {offer.listingName}
      </h4>

      <div className="space-y-2 mb-4 pb-4 border-b border-relay-accent/20">
        <div className="flex justify-between items-center text-xs">
          <span className="text-white/60">Size</span>
          <span className="text-relay-text font-medium">{offer.size}</span>
        </div>
        {offer.originalPrice > 0 && (
          <div className="flex justify-between items-center text-xs">
            <span className="text-white/60">Original Price</span>
            <span className="text-relay-text line-through">
              ${offer.originalPrice.toFixed(2)}
            </span>
          </div>
        )}
        <div className="flex justify-between items-center text-sm">
          <span className="text-white/60">Offer Price</span>
          <span className="text-relay-accent font-semibold">
            ${offer.offerPrice.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Pending — Accept/Decline for receiver, "Pending" for sender */}
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

      {/* Accepted — show status + "Go to Checkout" for the buyer */}
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

function ConversationList({
  conversations,
  selectedId,
  onSelect,
  searchQuery,
  onSearchChange,
}: {
  conversations: ConversationData[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  searchQuery: string;
  onSearchChange: (value: string) => void;
}) {
  const filtered = conversations.filter((c) => {
    const name = c.otherUser?.display_name || c.otherUser?.full_name || "";
    return name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  return (
    <div className="w-80 border-r border-white/10 flex flex-col max-h-[calc(100vh-200px)]">
      <div className="p-4 border-b border-white/10">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
          <input
            type="text"
            placeholder="Search conversations..."
            className="relay-input"
            style={{ paddingLeft: "2.5rem" }}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto relay-scrollbar">
        {filtered.map((conv) => {
          const name = conv.otherUser?.display_name || conv.otherUser?.full_name || "Unknown User";
          return (
            <button
              key={conv.id}
              onClick={() => onSelect(conv.id)}
              className={`w-full p-4 border-b border-white/5 hover:bg-white/[0.03] transition-colors text-left ${
                selectedId === conv.id ? "bg-white/[0.06]" : ""
              }`}
            >
              <div className="flex items-start gap-3">
                <Avatar name={name} avatarUrl={conv.otherUser?.avatar_url} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-1">
                    <p className="text-sm font-semibold text-relay-text truncate">
                      {name}
                    </p>
                    {conv.otherUser?.is_verified_seller && (
                      <svg
                        className="w-3.5 h-3.5 text-relay-accent flex-shrink-0"
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
                  <p className="text-xs text-white/50 truncate">
                    {conv.last_message || "No messages yet"}
                  </p>
                  <p className="text-xs text-white/40 mt-1">
                    {conv.last_message_at
                      ? new Date(conv.last_message_at).toLocaleDateString()
                      : ""}
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ChatArea({
  conversation,
  currentUserId,
  isSeller,
  onShowOfferModal,
  onSendMessage,
  onAcceptOffer,
  onDeclineOffer,
  onGoToCheckout,
}: {
  conversation: ConversationData | null;
  currentUserId: string;
  isSeller: boolean;
  onShowOfferModal: () => void;
  onSendMessage: (conversationId: string, content: string) => Promise<void>;
  onAcceptOffer: (messageId: string) => Promise<void>;
  onDeclineOffer: (messageId: string) => Promise<void>;
  onGoToCheckout: (msg: MessageData) => void;
}) {
  const [inputValue, setInputValue] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [conversation?.messages?.length, scrollToBottom]);

  const handleSend = async () => {
    if (!inputValue.trim() || !conversation || sending) return;
    const content = inputValue.trim();
    setInputValue("");
    setSending(true);
    try {
      await onSendMessage(conversation.id, content);
    } catch (error) {
      console.error("Error sending message:", error);
      setInputValue(content); // restore on failure
    } finally {
      setSending(false);
    }
  };

  if (!conversation) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <MessageCircle className="w-8 h-8 text-white/40" />
          </div>
          <p className="text-white/60 text-sm">
            Select a conversation to start messaging
          </p>
        </div>
      </div>
    );
  }

  const otherName = conversation.otherUser?.display_name || conversation.otherUser?.full_name || "Unknown User";
  const sortedMessages = [...conversation.messages].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  return (
    <div className="flex-1 flex flex-col">
      <div className="border-b border-white/10 p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Avatar name={otherName} avatarUrl={conversation.otherUser?.avatar_url} />
          <div>
            <div className="flex items-center gap-1.5">
              <p className="font-semibold text-relay-text">{otherName}</p>
              {conversation.otherUser?.is_verified_seller && (
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
          </div>
        </div>

        <button className="p-2 hover:bg-white/5 rounded-lg transition-colors">
          <MoreVertical className="w-5 h-5 text-white/40" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto relay-scrollbar p-4 space-y-4">
        {sortedMessages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-white/30 text-sm">No messages yet. Say hello!</p>
          </div>
        )}
        {sortedMessages.map((msg, idx) => {
          const isUser = msg.sender_id === currentUserId;
          const showTimestamp =
            idx === 0 ||
            new Date(msg.created_at).getTime() -
              new Date(sortedMessages[idx - 1].created_at).getTime() >
              600000;

          return (
            <div key={msg.id}>
              {showTimestamp && (
                <div className="flex justify-center mb-4">
                  <p className="text-xs text-white/40">
                    {new Date(msg.created_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              )}

              {msg.message_type === "custom_offer" ? (
                <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                  <OfferCard
                    offer={{
                      originalPrice: msg._offerOriginalPrice || 0,
                      offerPrice: msg.custom_offer_price || 0,
                      size: msg.custom_offer_size || "N/A",
                      listingName: msg._offerListingName || msg.content || "Custom Offer",
                      status: msg.custom_offer_status || "pending",
                    }}
                    isSender={isUser}
                    onAccept={() => onAcceptOffer(msg.id)}
                    onDecline={() => onDeclineOffer(msg.id)}
                    onGoToCheckout={() => onGoToCheckout(msg)}
                  />
                </div>
              ) : msg.content ? (
                <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-xs px-4 py-2 rounded-2xl ${
                      isUser
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
        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-white/10 p-4 space-y-3">
        <div className="flex gap-3">
          <input
            type="text"
            placeholder="Type your message..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            className="relay-input flex-1"
          />
          <button
            onClick={handleSend}
            disabled={!inputValue.trim() || sending}
            className="relay-button-accent px-4 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-4 h-4" />
            <span className="hidden sm:inline">Send</span>
          </button>
        </div>

        {isSeller && (
          <button
            onClick={onShowOfferModal}
            className="relay-button-secondary w-full flex items-center justify-center gap-2"
          >
            <DollarSign className="w-4 h-4" />
            Send Custom Offer
          </button>
        )}
      </div>
    </div>
  );
}

export default function MessagesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentUser } = useAuth();
  const { markMessagesRead } = useNotificationStore();
  const [conversations, setConversations] = useState<ConversationData[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<string | null>(
    searchParams.get("conversation") || null
  );
  const [showOfferModal, setShowOfferModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);

  // Clear the notification dot when viewing messages
  useEffect(() => {
    markMessagesRead();
  }, [markMessagesRead]);

  // Mark specific conversation as read when selected
  useEffect(() => {
    if (!selectedConversation || !currentUser?.id) return;
    const supabase = createClient();
    supabase
      .from('conversation_reads')
      .upsert(
        { user_id: currentUser.id, conversation_id: selectedConversation, last_read_at: new Date().toISOString() },
        { onConflict: 'user_id,conversation_id' }
      )
      .then();
  }, [selectedConversation, currentUser?.id]);

  const fetchConversations = useCallback(async () => {
    if (!currentUser?.id) return;

    const supabase = createClient();

    try {
      // Fetch conversations
      const { data: convos } = await supabase
        .from("conversations")
        .select("*")
        .contains("participant_ids", [currentUser!.id])
        .order("last_message_at", { ascending: false });

      if (!convos) return;

      // For each conversation, fetch the other participant's profile and messages
      const formatted: ConversationData[] = await Promise.all(
        convos.map(async (conv) => {
          // Find the other participant
          const otherUserId = conv.participant_ids.find((id: string) => id !== currentUser!.id);

          let otherUser = null;
          if (otherUserId) {
            const { data: profile } = await supabase
              .from("profiles")
              .select("id, display_name, full_name, avatar_url, is_verified_seller")
              .eq("id", otherUserId)
              .maybeSingle();
            otherUser = profile;
          }

          // Fetch messages for this conversation
          const { data: messages } = await supabase
            .from("messages")
            .select("*")
            .eq("conversation_id", conv.id)
            .order("created_at", { ascending: true });

          // Enrich custom offer messages with listing details from custom_offers table
          let enrichedMessages = messages || [];
          const offerMessages = enrichedMessages.filter((m: any) => m.message_type === "custom_offer");
          if (offerMessages.length > 0) {
            const { data: offers } = await supabase
              .from("custom_offers")
              .select("*, listing:listings(brand, model, nickname)")
              .eq("conversation_id", conv.id);

            if (offers) {
              enrichedMessages = enrichedMessages.map((msg: any) => {
                if (msg.message_type !== "custom_offer") return msg;
                // Match by sender, size, price, and approximate time
                const matchingOffer = offers.find(
                  (o: any) =>
                    o.sender_id === msg.sender_id &&
                    o.size === msg.custom_offer_size &&
                    parseFloat(o.offer_price) === parseFloat(msg.custom_offer_price)
                );
                if (matchingOffer) {
                  const listing = matchingOffer.listing;
                  const listingName = listing
                    ? `${listing.brand} ${listing.model}${listing.nickname ? ` "${listing.nickname}"` : ""}`
                    : undefined;
                  return {
                    ...msg,
                    _offerListingName: listingName,
                    _offerOriginalPrice: parseFloat(matchingOffer.original_price),
                    _offerListingId: matchingOffer.listing_id,
                    _offerCustomOfferId: matchingOffer.id,
                  };
                }
                return msg;
              });
            }
          }

          return {
            ...conv,
            otherUser,
            messages: enrichedMessages,
          };
        })
      );

      setConversations(formatted);

      // Auto-select first conversation if none selected
      if (!selectedConversation && formatted.length > 0) {
        setSelectedConversation(formatted[0].id);
      }
    } catch (error) {
      console.error("Error fetching conversations:", error);
    }
  }, [currentUser?.id]);

  // Initial load
  useEffect(() => {
    if (!currentUser?.id) {
      setLoading(false);
      return;
    }

    fetchConversations().then(() => setLoading(false));
  }, [currentUser?.id, fetchConversations]);

  // Realtime subscription for new messages
  useEffect(() => {
    if (!currentUser?.id) return;

    const supabase = createClient();

    const channel = supabase
      .channel("messages-realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
        },
        (payload) => {
          const newMsg = payload.new as MessageData;

          // Check if this message belongs to one of our conversations
          setConversations((prev) => {
            const convIndex = prev.findIndex((c) => c.id === newMsg.conversation_id);
            if (convIndex === -1) {
              // Might be a new conversation — refetch
              fetchConversations();
              return prev;
            }

            // Check if message already exists (prevent duplicates from optimistic updates)
            const existing = prev[convIndex].messages.find((m) => m.id === newMsg.id);
            if (existing) return prev;

            const updated = [...prev];
            updated[convIndex] = {
              ...updated[convIndex],
              messages: [...updated[convIndex].messages, newMsg],
              last_message: newMsg.content || updated[convIndex].last_message,
              last_message_at: newMsg.created_at,
            };
            return updated;
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
        },
        (payload) => {
          const updatedMsg = payload.new as MessageData;

          setConversations((prev) => {
            return prev.map((conv) => ({
              ...conv,
              messages: conv.messages.map((m) =>
                m.id === updatedMsg.id ? updatedMsg : m
              ),
            }));
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser?.id, fetchConversations]);

  const handleSendMessage = async (conversationId: string, content: string) => {
    if (!currentUser?.id) return;

    const supabase = createClient();
    const now = new Date().toISOString();

    // Optimistic update
    const tempId = `temp-${Date.now()}`;
    const tempMsg: MessageData = {
      id: tempId,
      sender_id: currentUser!.id,
      content,
      created_at: now,
      message_type: "text",
    };

    setConversations((prev) =>
      prev.map((conv) =>
        conv.id === conversationId
          ? {
              ...conv,
              messages: [...conv.messages, tempMsg],
              last_message: content,
              last_message_at: now,
            }
          : conv
      )
    );

    // Persist to DB
    const { data: inserted, error } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversationId,
        sender_id: currentUser!.id,
        content,
        message_type: "text",
      })
      .select()
      .single();

    if (error) {
      console.error("Error sending message:", error);
      // Remove optimistic message on failure
      setConversations((prev) =>
        prev.map((conv) =>
          conv.id === conversationId
            ? {
                ...conv,
                messages: conv.messages.filter((m) => m.id !== tempId),
              }
            : conv
        )
      );
      throw error;
    }

    // Replace temp message with real one
    if (inserted) {
      setConversations((prev) =>
        prev.map((conv) =>
          conv.id === conversationId
            ? {
                ...conv,
                messages: conv.messages.map((m) =>
                  m.id === tempId ? inserted : m
                ),
              }
            : conv
        )
      );
    }

    // Update conversation last_message
    await supabase
      .from("conversations")
      .update({ last_message: content, last_message_at: now })
      .eq("id", conversationId);
  };

  const updateOfferStatus = async (messageId: string, status: "accepted" | "declined") => {
    // 1. Optimistic UI update FIRST so the card changes instantly
    setConversations((prev) =>
      prev.map((conv) => ({
        ...conv,
        messages: conv.messages.map((m) =>
          m.id === messageId ? { ...m, custom_offer_status: status } : m
        ),
      }))
    );

    // 2. Then update DB in background
    const supabase = createClient();

    let targetMsg: MessageData | undefined;
    let targetConvId: string | undefined;
    for (const conv of conversations) {
      const found = conv.messages.find((m) => m.id === messageId);
      if (found) {
        targetMsg = found;
        targetConvId = conv.id;
        break;
      }
    }

    if (!targetMsg || !targetConvId) return;

    // Update the message status
    const { error: msgError } = await supabase
      .from("messages")
      .update({ custom_offer_status: status })
      .eq("id", messageId);

    if (msgError) {
      console.error(`Message update error:`, msgError);
    }

    // Update custom_offers table
    if (targetMsg._offerCustomOfferId) {
      const { error: offerError } = await supabase
        .from("custom_offers")
        .update({ status })
        .eq("id", targetMsg._offerCustomOfferId);

      if (offerError) {
        console.error(`Custom offers update error:`, offerError);
      }
    } else {
      // Fallback: match by conversation + size + price
      await supabase
        .from("custom_offers")
        .update({ status })
        .eq("conversation_id", targetConvId)
        .eq("size", targetMsg.custom_offer_size || "")
        .eq("offer_price", targetMsg.custom_offer_price || 0);
    }
  };

  const handleAcceptOffer = async (messageId: string) => {
    await updateOfferStatus(messageId, "accepted");
  };

  const handleDeclineOffer = async (messageId: string) => {
    await updateOfferStatus(messageId, "declined");
  };

  const handleGoToCheckout = (msg: MessageData) => {
    if (!msg._offerListingId) {
      alert("Could not find listing details for this offer.");
      return;
    }
    const url = `/checkout?listing=${encodeURIComponent(msg._offerListingId)}&size=${encodeURIComponent(msg.custom_offer_size || "")}&customOffer=${encodeURIComponent(msg._offerCustomOfferId || "true")}`;
    window.location.href = url;
  };

  const handleOfferSent = (conversationId: string, offerMessage: MessageData) => {
    setConversations((prev) =>
      prev.map((conv) =>
        conv.id === conversationId
          ? {
              ...conv,
              messages: [...conv.messages, offerMessage],
              last_message: `Custom offer: $${offerMessage.custom_offer_price}`,
              last_message_at: offerMessage.created_at,
            }
          : conv
      )
    );
  };

  const currentConv = conversations.find((c) => c.id === selectedConversation) || null;
  const isSeller = currentUser?.role === "seller" || currentUser?.role === "admin";

  if (loading) {
    return <div className="relay-empty text-center">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="relay-eyebrow text-relay-accent mb-2">INBOX</p>
        <h1 className="relay-title">Messages</h1>
      </div>

      {conversations.length > 0 ? (
        <div className="relay-card p-0 flex h-[calc(100vh-300px)] overflow-hidden">
          <ConversationList
            conversations={conversations}
            selectedId={selectedConversation}
            onSelect={setSelectedConversation}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
          />

          <ChatArea
            conversation={currentConv}
            currentUserId={currentUser?.id || ""}
            isSeller={isSeller}
            onShowOfferModal={() => setShowOfferModal(true)}
            onSendMessage={handleSendMessage}
            onAcceptOffer={handleAcceptOffer}
            onDeclineOffer={handleDeclineOffer}
            onGoToCheckout={handleGoToCheckout}
          />
        </div>
      ) : (
        <div className="relay-card p-12 text-center">
          <MessageCircle className="w-16 h-16 text-white/20 mx-auto mb-4" />
          <p className="text-relay-text mb-2">No conversations yet</p>
          <p className="text-relay-muted text-sm">
            Start messaging with buyers or sellers
          </p>
        </div>
      )}

      {showOfferModal && currentConv && (
        <CustomOfferModal
          onClose={() => setShowOfferModal(false)}
          conversationId={currentConv.id}
          recipientName={
            currentConv.otherUser?.display_name ||
            currentConv.otherUser?.full_name ||
            "this buyer"
          }
          onOfferSent={handleOfferSent}
        />
      )}
    </div>
  );
}
