import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import LogoutButton from "@/app/components/logout-button";
import NotificationsNavButton from "@/app/components/notifications-nav-button";

export default async function Navbar() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let username: string | null = null;
  let unreadNotifications = 0;

  if (user) {
    const [{ data: profile }, { count }] = await Promise.all([
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
    ]);

    username = profile?.username ?? null;
    unreadNotifications = count ?? 0;
  }

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center">
            <Image
              src="/branding/relay-logo.png"
              alt="Relay"
              width={180}
              height={44}
              priority
              className="h-auto w-[150px] object-contain md:w-[170px]"
            />
          </Link>

          <nav className="hidden items-center gap-5 md:flex">
            <Link
              href="/marketplace"
              className="text-sm font-medium text-slate-600 hover:text-slate-900"
            >
              Marketplace
            </Link>

            <Link
              href="/sell"
              className="text-sm font-medium text-slate-600 hover:text-slate-900"
            >
              Sell
            </Link>

            <Link
              href="/messages"
              className="text-sm font-medium text-slate-600 hover:text-slate-900"
            >
              Messages
            </Link>

            <Link
              href="/orders"
              className="text-sm font-medium text-slate-600 hover:text-slate-900"
            >
              Orders
            </Link>

            <Link
              href="/my-listings"
              className="text-sm font-medium text-slate-600 hover:text-slate-900"
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
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100"
              >
                Dashboard
              </Link>

              <NotificationsNavButton
                userId={user.id}
                initialUnreadCount={unreadNotifications}
              />

              {username && !username.startsWith("user_") && (
                <Link
                  href={`/profile/${username}`}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100"
                >
                  @{username}
                </Link>
              )}

              <LogoutButton />
            </>
          ) : (
            <>
              <Link
                href="/auth/login"
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100"
              >
                Log In
              </Link>

              <Link
                href="/auth/signup"
                className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
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