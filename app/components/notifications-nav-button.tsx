"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type NotificationsNavButtonProps = {
  userId: string;
  initialUnreadNotificationCount: number;
  initialUnreadConversationCount: number;
  mobileIconOnly?: boolean;
};

export default function NotificationsNavButton({
  userId,
  initialUnreadNotificationCount,
  initialUnreadConversationCount,
  mobileIconOnly = false,
}: NotificationsNavButtonProps) {
  const supabase = useMemo(() => createClient(), []);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(
    initialUnreadNotificationCount
  );
  const [unreadConversationCount, setUnreadConversationCount] = useState(
    initialUnreadConversationCount
  );

  async function refreshUnreadNotificationCount() {
    const { count } = await supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("profile_id", userId)
      .eq("is_read", false);

    setUnreadNotificationCount(count ?? 0);
  }

  async function refreshUnreadConversationCount() {
    const { data } = await supabase
      .from("messages")
      .select("conversation_id")
      .is("read_at", null)
      .neq("sender_id", userId);

    const uniqueConversationIds = new Set(
      (data ?? []).map((row) => row.conversation_id)
    );
    setUnreadConversationCount(uniqueConversationIds.size);
  }

  useEffect(() => {
    refreshUnreadNotificationCount();
    refreshUnreadConversationCount();

    const notificationsChannel = supabase
      .channel(`nav-notifications:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
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
      .channel(`nav-messages:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
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

  if (mobileIconOnly) {
    return (
      <Link
        href="/notifications"
        aria-label="Notifications"
        className="relative inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white transition hover:bg-white/10"
      >
        <Bell size={18} />
        {totalBadgeCount >= 1 && (
          <span className="absolute -right-1 -top-1 inline-flex min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
            {totalBadgeCount}
          </span>
        )}
      </Link>
    );
  }

  return (
    <Link
      href="/notifications"
      className="relative inline-flex min-h-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/10"
    >
      <span>Notifications</span>

      {totalBadgeCount >= 1 && (
        <span className="ml-2 inline-flex min-w-[22px] items-center justify-center rounded-full bg-red-500 px-2 py-0.5 text-xs font-semibold text-white">
          {totalBadgeCount}
        </span>
      )}
    </Link>
  );
}