"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ShoppingBag,
  Upload,
  List,
  FileSpreadsheet,
  MessageSquare,
  Package,
  Tag,
  Palette,
  Settings,
  ChevronLeft,
  ChevronRight,
  Rss,
  LogOut,
  ClipboardCheck,
  Users,
  Shield,
  ShieldCheck,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useSidebarStore } from "@/store/sidebarStore";
import { useNotificationStore } from "@/store/notificationStore";

export function Sidebar() {
  const pathname = usePathname();
  const { currentUser: user, signOut } = useAuth();
  const { isCollapsed, toggleCollapsed } = useSidebarStore();
  const { hasUnreadMessages, hasUnseenOrders, initialize } = useNotificationStore();

  // Initialize notification subscriptions when user is available
  useEffect(() => {
    if (user?.id) {
      initialize(user.id);
    }
  }, [user?.id, initialize]);

  const isActive = (path: string) => {
    if (path === "/" && pathname === "/") return true;
    if (path === "/admin") return pathname === "/admin";
    if (path === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(path) && path !== "/";
  };

  const sellerLinks = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/feed", label: "Feed", icon: Rss },
    { href: "/marketplace", label: "Marketplace", icon: ShoppingBag },
    { href: "/sell", label: "Sell", icon: Upload },
    { href: "/my-listings", label: "My Listings", icon: List },
    { href: "/inventory/bulk-import", label: "Bulk Import", icon: FileSpreadsheet },
    { href: "/messages", label: "Messages", icon: MessageSquare },
    { href: "/orders", label: "Orders", icon: Package },
    { href: "/tags", label: "Relay Tags", icon: Tag },
    { href: "/profile/studio", label: "Profile Studio", icon: Palette },
    { href: "/settings", label: "Settings", icon: Settings },
  ];

  const buyerLinks = [
    { href: "/feed", label: "Feed", icon: Rss },
    { href: "/marketplace", label: "Marketplace", icon: ShoppingBag },
    { href: "/messages", label: "Messages", icon: MessageSquare },
    { href: "/orders", label: "Orders", icon: Package },
    { href: "/settings", label: "Settings", icon: Settings },
  ];

  const adminLinks = [
    { href: "/admin", label: "Admin Dashboard", icon: LayoutDashboard },
    { href: "/admin/trust", label: "Seller Trust", icon: Shield },
    { href: "/admin/auth-risk", label: "Auth & Risk", icon: ShieldCheck },
    { href: "/admin/tags", label: "Relay Tags", icon: Tag },
    { href: "/admin/listing-reviews", label: "Listing Reviews", icon: ClipboardCheck },
    { href: "/admin/users", label: "All Users", icon: Users },
    ...sellerLinks,
  ];

  const getNavLinks = () => {
    if (user?.role === "admin") return adminLinks;
    if (user?.role === "seller") return sellerLinks;
    return buyerLinks;
  };

  const navLinks = getNavLinks();

  return (
    <aside
      className={`fixed left-0 top-0 h-screen bg-relay-bg/80 backdrop-blur-xl border-r border-white/10 transition-all duration-300 z-30 flex flex-col ${
        isCollapsed ? "w-20" : "w-64"
      }`}
    >
      {/* Header */}
      <div className={`h-[72px] flex items-center border-b border-white/10 ${isCollapsed ? 'justify-center' : 'justify-between px-4'}`}>
        {!isCollapsed ? (
          <Link href="/" className="flex items-center">
            <Image
              src="/branding/logo-darkmode.png"
              alt="Relay"
              width={75}
              height={27}
              className="object-contain"
              priority
            />
          </Link>
        ) : (
          <Link href="/" className="flex items-center justify-center">
            <Image
              src="/branding/logo-darkmode.png"
              alt="Relay"
              width={32}
              height={32}
              className="object-contain"
              priority
            />
          </Link>
        )}
        <button
          onClick={toggleCollapsed}
          className="p-1.5 rounded-lg hover:bg-white/[0.08] transition-colors text-white/60 hover:text-relay-text"
        >
          {isCollapsed ? (
            <ChevronRight size={20} />
          ) : (
            <ChevronLeft size={20} />
          )}
        </button>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-3 py-6 overflow-y-auto space-y-1">
        {navLinks.map((link) => {
          const Icon = link.icon;
          const active = isActive(link.href);
          const showDot =
            (link.href === "/messages" && hasUnreadMessages) ||
            (link.href === "/orders" && hasUnseenOrders);

          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex items-center gap-3 py-3 rounded-lg transition-colors ${
                isCollapsed ? "justify-center px-0" : "px-4"
              } ${
                active
                  ? "bg-relay-accent text-relay-bg"
                  : "text-white/60 hover:text-relay-text hover:bg-white/[0.04]"
              }`}
              title={isCollapsed ? link.label : undefined}
            >
              <span className="relative flex-shrink-0">
                <Icon size={20} />
                {showDot && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-blue-500 rounded-full border-2 border-relay-bg" />
                )}
              </span>
              {!isCollapsed && (
                <span className="text-sm font-medium">{link.label}</span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* User Info */}
      {user && (
        <div className="px-3 py-4 border-t border-white/10 space-y-3">
          <div className={`flex items-center gap-3 ${isCollapsed ? 'justify-center' : 'px-2'}`}>
            {user.avatar_url ? (
              <img
                src={user.avatar_url}
                alt={user.display_name || user.full_name}
                className="w-10 h-10 rounded-full object-cover border border-white/10 flex-shrink-0"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-relay-accent flex items-center justify-center text-relay-bg font-semibold text-sm flex-shrink-0">
                {user.display_name?.[0]?.toUpperCase() || user.full_name?.[0]?.toUpperCase() || "U"}
              </div>
            )}
            {!isCollapsed && (
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-relay-text truncate">
                  {user.display_name || user.full_name}
                </div>
                <div className="text-xs text-white/40 truncate capitalize">
                  {user.role}
                </div>
              </div>
            )}
          </div>

          {!isCollapsed && (
            <button
              onClick={signOut}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-red-400 hover:bg-red-500/10 transition-colors"
            >
                            <LogOut size={16} />
              Sign Out
            </button>
          )}
        </div>
      )}
    </aside>
  );
}
