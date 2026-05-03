"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ShoppingBag,
  MessageSquare,
  Package,
  Settings,
  Plus,
  Rss,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useNotificationStore } from "@/store/notificationStore";

export function MobileBottomBar() {
  const pathname = usePathname();
  const { currentUser: user } = useAuth();
  const { hasUnreadMessages, hasUnseenOrders } = useNotificationStore();

  const isActive = (path: string) => {
    if (path === "/" && pathname === "/") return true;
    return pathname.startsWith(path) && path !== "/";
  };

  const links = [
    { href: "/feed", icon: Rss, label: "Feed" },
    { href: "/marketplace", icon: ShoppingBag, label: "Shop" },
    { href: "/messages", icon: MessageSquare, label: "Messages" },
    { href: "/sell", icon: Plus, label: "Sell" },
    { href: "/orders", icon: Package, label: "Orders" },
  ];

  // Filter links based on user role
  const filteredLinks = links.filter((link) => {
    if (link.href === "/sell" && user?.role !== "seller") {
      return false;
    }
    return true;
  });

  return (
    <div className="fixed bottom-0 left-0 right-0 h-[80px] bg-relay-bg/95 backdrop-blur-xl border-t border-white/10 flex items-center justify-around px-2 z-30">
      {filteredLinks.map((link) => {
        const Icon = link.icon;
        const active = isActive(link.href);
        const showDot =
          (link.href === "/messages" && hasUnreadMessages) ||
          (link.href === "/orders" && hasUnseenOrders);

        return (
          <Link
            key={link.href}
            href={link.href}
            className={`flex flex-col items-center justify-center gap-1 py-2 px-3 rounded-lg transition-colors flex-1 ${
              active
                ? "text-relay-accent"
                : "text-white/60 hover:text-relay-text"
            }`}
          >
            <span className="relative">
              <Icon size={24} />
              {showDot && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-blue-500 rounded-full border-2 border-relay-bg" />
              )}
            </span>
            <span className="text-xs font-medium">{link.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
