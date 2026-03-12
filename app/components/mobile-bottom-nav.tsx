"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  MessageCircle,
  PlusSquare,
  Package,
  User,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import LogoutButton from "@/app/components/logout-button";
import { Capacitor } from "@capacitor/core";

export default function MobileBottomNav() {
  const pathname = usePathname();
  const supabase = useMemo(() => createClient(), []);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const [profileHref, setProfileHref] = useState("/auth/login");
  const [dashboardHref, setDashboardHref] = useState("/auth/login");
  const [profileLabel, setProfileLabel] = useState("Profile");

  const [messagesBadgeCount, setMessagesBadgeCount] = useState(0);
  const [ordersBadgeCount, setOrdersBadgeCount] = useState(0);

  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [isAuthed, setIsAuthed] = useState(false);

  const nativeApp = Capacitor.isNativePlatform();

  async function refreshBadges(userId: string) {
    const [{ data: unreadMessages }, { count: unreadNotifications }] =
      await Promise.all([
        supabase
          .from("messages")
          .select("conversation_id")
          .is("read_at", null)
          .neq("sender_id", userId),

        supabase
          .from("notifications")
          .select("*", { count: "exact", head: true })
          .eq("profile_id", userId)
          .eq("is_read", false),
      ]);

    const uniqueConversationIds = new Set(
      (unreadMessages ?? []).map((row) => row.conversation_id)
    );

    setMessagesBadgeCount(uniqueConversationIds.size);
    setOrdersBadgeCount(unreadNotifications ?? 0);
  }

  function resetToSignedOutState() {
    setIsAuthed(false);
    setProfileHref("/auth/login");
    setDashboardHref("/auth/login");
    setProfileLabel("Profile");
    setMessagesBadgeCount(0);
    setOrdersBadgeCount(0);
  }

  async function syncFromSession() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      resetToSignedOutState();
      return;
    }

    setIsAuthed(true);
    setDashboardHref("/dashboard");

    const { data: profile } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.username) {
      setProfileHref(`/profile/${profile.username}`);
      setProfileLabel(`@${profile.username}`);
    }

    await refreshBadges(user.id);
  }

  useEffect(() => {
    let mounted = true;

    async function init() {
      if (!mounted) return;
      await syncFromSession();
    }

    init();

    const {
      data: { subscription: authSubscription },
    } = supabase.auth.onAuthStateChange(async () => {
      setProfileMenuOpen(false);
      await syncFromSession();
    });

    const notificationsChannel = supabase
      .channel("mobile-bottom-nav-notifications")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications" },
        async () => {
          const {
            data: { user },
          } = await supabase.auth.getUser();

          if (user) await refreshBadges(user.id);
        }
      )
      .subscribe();

    const messagesChannel = supabase
      .channel("mobile-bottom-nav-messages")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages" },
        async () => {
          const {
            data: { user },
          } = await supabase.auth.getUser();

          if (user) await refreshBadges(user.id);
        }
      )
      .subscribe();

    function handleOutsideClick(event: MouseEvent) {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(event.target as Node)) {
        setProfileMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);

    return () => {
      mounted = false;
      document.removeEventListener("mousedown", handleOutsideClick);
      authSubscription.unsubscribe();
      supabase.removeChannel(notificationsChannel);
      supabase.removeChannel(messagesChannel);
    };
  }, [supabase]);

  const navItems = [
    { href: "/marketplace", icon: Home, label: "Market" },
    {
      href: "/messages",
      icon: MessageCircle,
      label: "Messages",
      badge: messagesBadgeCount,
    },
    { href: "/sell", icon: PlusSquare, label: "Sell", isPrimary: true },
    {
      href: "/orders",
      icon: Package,
      label: "Orders",
      badge: ordersBadgeCount,
    },
  ];

  const profileActive =
    pathname.startsWith("/profile/") || pathname === "/dashboard";

  return (
    <>
      {profileMenuOpen && (
        <div className="fixed inset-0 z-[55] bg-black/20 md:hidden" />
      )}

      <nav className="fixed inset-x-0 bottom-0 z-[60] border-t border-white/10 bg-[#06070a]/98 backdrop-blur-xl pb-[env(safe-area-inset-bottom)] md:hidden">
        <div className="mx-auto grid h-[72px] max-w-7xl grid-cols-5 px-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = pathname.startsWith(item.href);
            const badge = item.badge ?? 0;

            if (item.isPrimary) {
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className="flex min-h-[70px] flex-col items-center justify-start gap-1 px-1 pt-0.5"
                >
                  <div
                    className={`-mt-3 flex h-[52px] w-[52px] items-center justify-center rounded-[1.15rem] border transition ${
                      active
                        ? "border-white/25 bg-white text-black"
                        : "border-white/20 bg-[#06070a] text-white"
                    }`}
                  >
                    <Icon size={22} />
                  </div>

                  <span
                    className={`text-[11px] font-semibold ${
                      active ? "text-white" : "text-white/70"
                    }`}
                  >
                    {item.label}
                  </span>
                </Link>
              );
            }

            return (
              <Link
                key={item.label}
                href={item.href}
                className="relative flex min-h-[70px] flex-col items-center justify-center gap-1 px-1"
              >
                <div className="relative">
                  <Icon
                    size={20}
                    className={active ? "text-white" : "text-white/50"}
                  />

                  {badge >= 1 && (
                    <span className="absolute -right-2 -top-2 inline-flex min-w-[17px] items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                      {badge}
                    </span>
                  )}
                </div>

                <span
                  className={`text-[11px] font-medium ${
                    active ? "text-white" : "text-white/50"
                  }`}
                >
                  {item.label}
                </span>
              </Link>
            );
          })}

          <div
            ref={menuRef}
            className="relative flex min-h-[70px] items-center justify-center"
          >
            <button
              onClick={() => setProfileMenuOpen((prev) => !prev)}
              className="flex min-h-[70px] w-full flex-col items-center justify-center gap-1 px-1"
            >
              <User
                size={20}
                className={profileActive ? "text-white" : "text-white/50"}
              />

              <span
                className={`text-[11px] font-medium ${
                  profileActive ? "text-white" : "text-white/50"
                }`}
              >
                Profile
              </span>
            </button>

            {profileMenuOpen && (
              <div className="absolute bottom-[78px] right-0 w-44 overflow-hidden rounded-2xl border border-white/10 bg-[#0d1017]/98 shadow-[0_18px_50px_rgba(0,0,0,0.45)] backdrop-blur-2xl">
                {isAuthed ? (
                  <div className="p-2">
                    <Link
                      href={profileHref}
                      onClick={() => setProfileMenuOpen(false)}
                      className="flex min-h-11 items-center rounded-xl px-3 text-sm font-medium text-white hover:bg-white/10"
                    >
                      {profileLabel}
                    </Link>

                    <Link
                      href={dashboardHref}
                      onClick={() => setProfileMenuOpen(false)}
                      className="flex min-h-11 items-center rounded-xl px-3 text-sm font-medium text-white hover:bg-white/10"
                    >
                      Dashboard
                    </Link>

                    {nativeApp && isAuthed && (
                      <div className="px-2 pt-2">
                        <LogoutButton compact />
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-2">
                    <Link
                      href="/auth/login"
                      onClick={() => setProfileMenuOpen(false)}
                      className="flex min-h-11 items-center rounded-xl px-3 text-sm font-medium text-white hover:bg-white/10"
                    >
                      Log In
                    </Link>

                    <Link
                      href="/auth/signup"
                      onClick={() => setProfileMenuOpen(false)}
                      className="flex min-h-11 items-center rounded-xl px-3 text-sm font-medium text-white hover:bg-white/10"
                    >
                      Sign Up
                    </Link>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </nav>
    </>
  );
}