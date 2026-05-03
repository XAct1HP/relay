'use client';

import { create } from 'zustand';
import { createClient } from '@/lib/supabase';
import { RealtimeChannel } from '@supabase/supabase-js';

interface NotificationState {
  hasUnreadMessages: boolean;
  hasUnseenOrders: boolean;
  _channels: RealtimeChannel[];
  _userId: string | null;

  // Actions
  initialize: (userId: string) => void;
  cleanup: () => void;
  markMessagesRead: () => void;
  markOrdersSeen: () => void;
  checkUnreadMessages: (userId: string) => Promise<void>;
  checkUnseenOrders: (userId: string) => Promise<void>;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  hasUnreadMessages: false,
  hasUnseenOrders: false,
  _channels: [],
  _userId: null,

  initialize: (userId: string) => {
    const state = get();
    // Don't re-initialize for the same user
    if (state._userId === userId) return;

    // Cleanup any existing subscriptions
    state.cleanup();

    set({ _userId: userId });

    const supabase = createClient();

    // Fetch initial state
    get().checkUnreadMessages(userId);
    get().checkUnseenOrders(userId);

    // Subscribe to new messages in real-time
    const messagesChannel = supabase
      .channel('notifications-messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        (payload) => {
          const newMsg = payload.new as { sender_id: string; conversation_id: string };
          // Only flag as unread if the message is from someone else
          if (newMsg.sender_id !== userId) {
            set({ hasUnreadMessages: true });
          }
        }
      )
      .subscribe();

    // Subscribe to order status changes in real-time
    const ordersChannel = supabase
      .channel('notifications-orders')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'orders',
        },
        (payload) => {
          const newOrder = payload.new as { buyer_id: string; seller_id: string };
          // New order relevant to this user
          if (newOrder.buyer_id === userId || newOrder.seller_id === userId) {
            set({ hasUnseenOrders: true });
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
        },
        (payload) => {
          const updated = payload.new as { buyer_id: string; seller_id: string; updated_at: string };
          // Order update relevant to this user
          if (updated.buyer_id === userId || updated.seller_id === userId) {
            set({ hasUnseenOrders: true });
          }
        }
      )
      .subscribe();

    set({ _channels: [messagesChannel, ordersChannel] });
  },

  cleanup: () => {
    const { _channels } = get();
    if (_channels.length > 0) {
      const supabase = createClient();
      _channels.forEach((ch) => supabase.removeChannel(ch));
    }
    set({ _channels: [], _userId: null, hasUnreadMessages: false, hasUnseenOrders: false });
  },

  markMessagesRead: () => {
    set({ hasUnreadMessages: false });
  },

  markOrdersSeen: () => {
    set({ hasUnseenOrders: false });
  },

  checkUnreadMessages: async (userId: string) => {
    const supabase = createClient();

    // Get all conversations this user participates in
    const { data: conversations } = await supabase
      .from('conversations')
      .select('id, last_message_at')
      .contains('participant_ids', [userId]);

    if (!conversations || conversations.length === 0) {
      set({ hasUnreadMessages: false });
      return;
    }

    // Get this user's read timestamps
    const { data: reads } = await supabase
      .from('conversation_reads')
      .select('conversation_id, last_read_at')
      .eq('user_id', userId);

    const readMap = new Map(
      (reads || []).map((r) => [r.conversation_id, r.last_read_at])
    );

    // Check if any conversation has messages newer than last read
    const hasUnread = conversations.some((conv) => {
      if (!conv.last_message_at) return false;
      const lastRead = readMap.get(conv.id);
      if (!lastRead) return true; // Never read = unread
      return new Date(conv.last_message_at) > new Date(lastRead);
    });

    set({ hasUnreadMessages: hasUnread });
  },

  checkUnseenOrders: async (userId: string) => {
    const supabase = createClient();

    // Check for orders where updated_at > last_seen_at for this user
    // As buyer: updated_at > buyer_last_seen_at
    const { data: buyerOrders } = await supabase
      .from('orders')
      .select('id, updated_at, buyer_last_seen_at')
      .eq('buyer_id', userId)
      .not('status', 'in', '("cancelled","completed")');

    const { data: sellerOrders } = await supabase
      .from('orders')
      .select('id, updated_at, seller_last_seen_at')
      .eq('seller_id', userId)
      .not('status', 'in', '("cancelled","completed")');

    const hasUnseen =
      (buyerOrders || []).some(
        (o) => !o.buyer_last_seen_at || new Date(o.updated_at) > new Date(o.buyer_last_seen_at)
      ) ||
      (sellerOrders || []).some(
        (o) => !o.seller_last_seen_at || new Date(o.updated_at) > new Date(o.seller_last_seen_at)
      );

    set({ hasUnseenOrders: hasUnseen });
  },
}));
