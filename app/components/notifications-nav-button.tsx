"use client";

import Link from "next/link";
import { Bell } from "lucide-react";

export default function NotificationsNavButton() {
  return (
    <Link
      href="/notifications"
      className="relative flex items-center justify-center rounded-full p-2 text-white/70 hover:text-white"
    >
      <Bell size={20} />

      {/* notification badge placeholder */}
      <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-semibold text-white">
        0
      </span>
    </Link>
  );
}