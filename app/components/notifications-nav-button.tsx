"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type NotificationsNavButtonProps = {
  userId: string;
  initialUnreadNotificationCount: number;
  initialUnreadConversationCount: number;
};

export default function NotificationsNavButton({
  userId,
  initialUnreadNotificationCount,
  initialUnreadConversationCount,
}: NotificationsNavButtonProps) {
  const supabase = useMemo(() => createClient(), []);
  const pathname = usePathname();

  const [unreadNotificationCount, setUnreadNotificationCount] = useState(
    initialUnreadNotificationCount
  );
  const [unreadConversationCount, setUnreadConversationCount] = useState(
    initialUnreadConversationCount
  );

  async function refreshUnreadConversationCount() {
    const { data, error } = await supabase
      .from("messages")
      .select("conversation_id")
      .is("read_at", null)
      .neq("sender_id", userId);

    if (!error) {
      const uniqueConversationIds = new Set(
        (data ?? []).map((row) => row.conversation_id)
      );
      setUnreadConversationCount(uniqueConversationIds.size);
    }
  }

  async function refreshUnreadNotificationCount() {
    const { count } = await supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("profile_id", userId)
      .eq("is_read", false);

    setUnreadNotificationCount(count ?? 0);
  }

  useEffect(() => {
    async function markReadIfOnNotificationsPage() {
      if (pathname !== "/notifications") return;

      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("profile_id", userId)
        .eq("is_read", false);

      if (!error) {
        setUnreadNotificationCount(0);
      }
    }

    markReadIfOnNotificationsPage();
  }, [pathname, supabase, userId]);

  useEffect(() => {
    const notificationsChannel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `profile_id=eq.${userId}`,
        },
        (payload) => {
          const notification = payload.new as { is_read: boolean };
          if (!notification.is_read) {
            setUnreadNotificationCount((count) => count + 1);
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "notifications",
          filter: `profile_id=eq.${userId}`,
        },
        async () => {
          await refreshUnreadNotificationCount();
        }
      )
      .subscribe();

    const messagesChannel = supabase
      .channel(`unread-messages:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
        },
        async () => {
          await refreshUnreadConversationCount();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
        },
        async () => {
          await refreshUnreadConversationCount();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(notificationsChannel);
      supabase.removeChannel(messagesChannel);
    };
  }, [supabase, userId]);

  const totalBadgeCount = unreadNotificationCount + unreadConversationCount;

  return (
    <Link
      href="/notifications"
      className="relative rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-white transition hover:bg-white/10"
    >
      Notifications

      {totalBadgeCount > 0 && (
        <span className="ml-2 inline-flex min-w-[22px] items-center justify-center rounded-full bg-blue-500 px-2 py-0.5 text-xs font-semibold text-white">
          {totalBadgeCount}
        </span>
      )}
    </Link>
  );
}