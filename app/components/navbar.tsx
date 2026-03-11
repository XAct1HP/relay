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
        supabase.from("profiles").select("username").eq("id", user.id).maybeSingle(),
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
    <header className="sticky top-0 z-[100] w-full border-b border-white/10 bg-[#06070a]/80 backdrop-blur-xl supports-[backdrop-filter]:bg-[#06070a]/72">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center pt-[2px]">
            <Image
              src="/branding/darkmode-logo.png"
              alt="Relay"
              width={180}
              height={44}
              priority
              className="h-auto w-[75px] object-contain md:w-[85px]"
            />
          </Link>

          <nav className="hidden items-center gap-6 md:flex">
            <Link
              href="/marketplace"
              className="text-sm font-medium text-white/70 transition hover:text-white"
            >
              Marketplace
            </Link>

            <Link
              href="/sell"
              className="text-sm font-medium text-white/70 transition hover:text-white"
            >
              Sell
            </Link>

            <Link
              href="/messages"
              className="text-sm font-medium text-white/70 transition hover:text-white"
            >
              Messages
            </Link>

            <Link
              href="/orders"
              className="text-sm font-medium text-white/70 transition hover:text-white"
            >
              Orders
            </Link>

            <Link
              href="/my-listings"
              className="text-sm font-medium text-white/70 transition hover:text-white"
            >
              My Listings
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {user ? (
            <>
              <Link
                href="/dashboard"
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-white transition hover:bg-white/10"
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
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-white transition hover:bg-white/10"
              >
                {profileLabel}
              </Link>

              <LogoutButton />
            </>
          ) : (
            <>
              <Link
                href="/auth/login"
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-white transition hover:bg-white/10"
              >
                Log In
              </Link>

              <Link
                href="/auth/signup"
                className="rounded-lg bg-white px-3 py-2 text-sm font-medium text-black transition hover:bg-white/90"
              >
                Sign Up
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}