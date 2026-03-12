"use client";

import Link from "next/link";
import Image from "next/image";
import NotificationsNavButton from "./notifications-nav-button";

export default function Navbar() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#06070a]/90 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">

        {/* logo */}
        <Link href="/" className="flex items-center gap-2">
          <Image
            src="/branding/darkmode-logo.png"
            alt="Relay"
            width={90}
            height={28}
            priority
          />
        </Link>

        {/* desktop nav */}
        <nav className="hidden md:flex items-center gap-6 text-sm">
          <Link href="/marketplace" className="text-white/70 hover:text-white">
            Marketplace
          </Link>

          <Link href="/messages" className="text-white/70 hover:text-white">
            Messages
          </Link>

          <Link href="/sell" className="text-white/70 hover:text-white">
            Sell
          </Link>

          <Link href="/orders" className="text-white/70 hover:text-white">
            Orders
          </Link>
        </nav>

        {/* right side */}
        <div className="flex items-center gap-3">
          <NotificationsNavButton />
        </div>
      </div>
    </header>
  );
}