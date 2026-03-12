import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import LogoutButton from "@/app/components/logout-button";
import NotificationsNavButton from "@/app/components/notifications-nav-button";

function getAdminEmails() {
  return new Set(
    (process.env.RELAY_ADMIN_EMAILS ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean)
  );
}

function navLinkClassName() {
  return "text-sm font-medium text-white/70 transition hover:text-white";
}

function mobileChipClassName() {
  return "inline-flex min-h-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/10";
}

export default async function Navbar() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let username: string | null = null;
  let unreadNotifications = 0;
  let unreadConversationCount = 0;
  let isAdmin = false;

  if (user) {
    const adminEmails = getAdminEmails();
    isAdmin = Boolean(user.email && adminEmails.has(user.email.toLowerCase()));

    const [{ data: profile }, { count }, { data: unreadMessages }] =
      await Promise.all([
        supabase
          .from("profiles")
          .select("username")
          .eq("id", user.id)
          .maybeSingle(),
        supabase
          .from("notifications")
          .select("*", { count: "exact", head: true })
          .eq("profile_id", user.id)
          .eq("is_read", false),
        supabase
          .from("messages")
          .select("conversation_id")
          .is("read_at", null)
          .neq("sender_id", user.id),
      ]);

    username = profile?.username ?? null;
    unreadNotifications = count ?? 0;

    unreadConversationCount = new Set(
      (unreadMessages ?? []).map((row) => row.conversation_id)
    ).size;
  }

  const profileHref = username ? `/profile/${username}` : "/onboarding";
  const profileLabel = username ? `@${username}` : "Profile";

  return (
    <header className="sticky top-0 z-[100] w-full border-b border-white/10 bg-[#06070a]/85 backdrop-blur-xl supports-[backdrop-filter]:bg-[#06070a]/72">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex min-h-[52px] items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-4 sm:gap-6">
            <Link href="/" className="flex shrink-0 items-center pt-[2px]">
              <Image
                src="/branding/darkmode-logo.png"
                alt="Relay"
                width={180}
                height={44}
                priority
                className="h-auto w-[72px] object-contain sm:w-[78px] md:w-[85px]"
              />
            </Link>

            <nav className="hidden items-center gap-5 md:flex">
              <Link href="/marketplace" className={navLinkClassName()}>
                Marketplace
              </Link>
              <Link href="/sell" className={navLinkClassName()}>
                Sell
              </Link>
              <Link href="/messages" className={navLinkClassName()}>
                Messages
              </Link>
              <Link href="/orders" className={navLinkClassName()}>
                Orders
              </Link>
              <Link href="/my-listings" className={navLinkClassName()}>
                My Listings
              </Link>
            </nav>
          </div>

          <div className="hidden items-center gap-3 md:flex">
            {user ? (
              <>
                <Link
                  href="/dashboard"
                  className="inline-flex min-h-10 items-center rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-white transition hover:bg-white/10"
                >
                  {isAdmin ? "Admin" : "Dashboard"}
                </Link>

                <NotificationsNavButton
                  userId={user.id}
                  initialUnreadNotificationCount={unreadNotifications}
                  initialUnreadConversationCount={unreadConversationCount}
                />

                <Link
                  href={profileHref}
                  className="inline-flex min-h-10 items-center rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-white transition hover:bg-white/10"
                >
                  {profileLabel}
                </Link>

                <Link
                  href="/profile/studio"
                  className="inline-flex min-h-10 items-center rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-white transition hover:bg-white/10"
                >
                  Studio
                </Link>

                <LogoutButton />
              </>
            ) : (
              <>
                <Link
                  href="/auth/login"
                  className="inline-flex min-h-10 items-center rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-white transition hover:bg-white/10"
                >
                  Log In
                </Link>

                <Link
                  href="/auth/signup"
                  className="inline-flex min-h-10 items-center rounded-lg bg-white px-3 py-2 text-sm font-medium text-black transition hover:bg-white/90"
                >
                  Sign Up
                </Link>
              </>
            )}
          </div>

          <div className="flex items-center gap-2 md:hidden">
            {user ? (
              <NotificationsNavButton
                userId={user.id}
                initialUnreadNotificationCount={unreadNotifications}
                initialUnreadConversationCount={unreadConversationCount}
              />
            ) : (
              <Link
                href="/auth/signup"
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-white/90"
              >
                Sign Up
              </Link>
            )}
          </div>
        </div>

        {/* keep the old expanded nav only on desktop; mobile uses bottom nav */}
        <div className="hidden md:block" />
      </div>
    </header>
  );
}