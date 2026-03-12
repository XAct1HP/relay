"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, MessageCircle, PlusSquare, Package, User } from "lucide-react";

export default function MobileBottomNav() {
  const pathname = usePathname();

  const navItems = [
    { href: "/marketplace", icon: Home, label: "Market" },
    { href: "/messages", icon: MessageCircle, label: "Messages" },
    { href: "/sell", icon: PlusSquare, label: "Sell" },
    { href: "/orders", icon: Package, label: "Orders" },
    { href: "/profile", icon: User, label: "Profile" },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-white/10 bg-[#06070a]/95 backdrop-blur-xl">
      <div className="flex h-16 items-center justify-around">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-col items-center justify-center gap-1 text-xs"
            >
              <Icon
                size={22}
                className={active ? "text-white" : "text-white/50"}
              />
              <span className={active ? "text-white" : "text-white/50"}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}