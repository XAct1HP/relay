"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type NotificationsNavButtonProps = {
  userId: string;
  initialUnreadCount: number;
};

export default function NotificationsNavButton({
  userId,
  initialUnreadCount,
}: NotificationsNavButtonProps) {
  const supabase = useMemo(() => createClient(), []);
  const pathname = usePathname();
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);

  useEffect(() => {
    async function markReadIfOnNotificationsPage() {
      if (pathname !== "/notifications") return;

      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("profile_id", userId)
        .eq("is_read", false);

      if (!error) {
        setUnreadCount(0);
      }
    }

    markReadIfOnNotificationsPage();
  }, [pathname, supabase, userId]);

  useEffect(() => {
    const channel = supabase
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
            setUnreadCount((count) => count + 1);
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
          const { count } = await supabase
            .from("notifications")
            .select("*", { count: "exact", head: true })
            .eq("profile_id", userId)
            .eq("is_read", false);

          setUnreadCount(count ?? 0);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, userId]);

  return (
    <Link
      href="/notifications"
      className="relative rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100"
    >
      Notifications
      {unreadCount > 0 && (
        <span className="ml-2 inline-flex min-w-[22px] items-center justify-center rounded-full bg-blue-600 px-2 py-0.5 text-xs font-semibold text-white">
          {unreadCount}
        </span>
      )}
    </Link>
  );
}