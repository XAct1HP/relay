"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Rss,
  Plus,
  Package,
  Menu,
  X,
  ShoppingBag,
  MessageSquare,
  List,
  FileSpreadsheet,
  Tag,
  Palette,
  Settings,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useNotificationStore } from "@/store/notificationStore";

interface MobileBottomBarProps {
  onMenuOpen?: () => void;
}

export function MobileBottomBar({ onMenuOpen }: MobileBottomBarProps) {
  const pathname = usePathname();
  const { currentUser: user } = useAuth();
  const { hasUnreadMessages, hasUnseenOrders } = useNotificationStore();
  const [sheetOpen, setSheetOpen] = useState(false);

  const isActive = (path: string) => {
    if (path === "/dashboard" && pathname === "/dashboard") return true;
    return pathname.startsWith(path) && path !== "/";
  };

  const isSeller = user?.role === "seller";

  // Secondary links for the bottom sheet
  const sheetLinks = [
    { href: "/messages", icon: MessageSquare, label: "Messages", dot: hasUnreadMessages },
    { href: "/marketplace", icon: ShoppingBag, label: "Market" },
    ...(isSeller ? [
      { href: "/my-listings", icon: List, label: "Listings" },
      { href: "/inventory/bulk-import", icon: FileSpreadsheet, label: "Import" },
      { href: "/tags", icon: Tag, label: "Tags" },
      { href: "/profile/studio", icon: Palette, label: "Studio" },
    ] : []),
    { href: "/settings", icon: Settings, label: "Settings" },
  ];

  return (
    <>
      {/* Bottom sheet overlay */}
      {sheetOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm"
          onClick={() => setSheetOpen(false)}
        />
      )}

      {/* Bottom sheet panel */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-50 transform transition-transform duration-300 ease-out ${
          sheetOpen ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="bg-[#0d1017]/95 backdrop-blur-2xl rounded-t-3xl border-t border-white/10 pb-[calc(100px+env(safe-area-inset-bottom,0px))]">
          {/* Handle */}
          <div className="flex justify-center pt-3 pb-5">
            <div className="w-10 h-1 rounded-full bg-white/20" />
          </div>

          {/* Grid of secondary links */}
          <nav className="grid grid-cols-4 gap-y-6 gap-x-2 px-6">
            {sheetLinks.map((link) => {
              const Icon = link.icon;
              const active = isActive(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setSheetOpen(false)}
                  className="flex flex-col items-center gap-1.5"
                >
                  <div className={`relative w-12 h-12 rounded-2xl flex items-center justify-center transition-colors ${
                    active ? "bg-[#5f8fff]/20" : "bg-white/[0.06]"
                  }`}>
                    <Icon size={20} className={active ? "text-[#5f8fff]" : "text-white/60"} />
                    {link.dot && (
                      <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-[#5f8fff] rounded-full border-2 border-[#0d1017]" />
                    )}
                  </div>
                  <span className={`text-[10px] font-medium ${active ? "text-[#5f8fff]" : "text-white/45"}`}>
                    {link.label}
                  </span>
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Main bottom bar */}
      <div className="fixed bottom-0 left-0 right-0 z-30 pb-[env(safe-area-inset-bottom,0px)]">
        {/* Frosted glass bar */}
        <div className="bg-[#06070a]/90 backdrop-blur-2xl border-t border-white/[0.08]">
          <div className="flex items-end justify-around px-2 h-[64px]">
            {/* Dashboard / Home */}
            <Link href="/dashboard" className="flex flex-col items-center justify-center gap-0.5 pt-2 pb-1 flex-1">
              <LayoutDashboard size={22} className={isActive("/dashboard") ? "text-[#5f8fff]" : "text-white/40"} />
              <span className={`text-[9px] font-medium ${isActive("/dashboard") ? "text-[#5f8fff]" : "text-white/30"}`}>Home</span>
            </Link>

            {/* Feed */}
            <Link href="/feed" className="flex flex-col items-center justify-center gap-0.5 pt-2 pb-1 flex-1">
              <Rss size={22} className={isActive("/feed") ? "text-[#5f8fff]" : "text-white/40"} />
              <span className={`text-[9px] font-medium ${isActive("/feed") ? "text-[#5f8fff]" : "text-white/30"}`}>Feed</span>
            </Link>

            {/* Sell FAB - center, raised */}
            {isSeller ? (
              <Link href="/sell" className="flex items-center justify-center flex-1">
                <div className="relative -top-3 w-[52px] h-[52px] rounded-2xl bg-[#5f8fff] shadow-[0_4px_24px_rgba(95,143,255,0.35)] flex items-center justify-center active:scale-95 transition-transform">
                  <Plus size={26} className="text-white" />
                </div>
              </Link>
            ) : (
              <Link href="/marketplace" className="flex flex-col items-center justify-center gap-0.5 pt-2 pb-1 flex-1">
                <ShoppingBag size={22} className={isActive("/marketplace") ? "text-[#5f8fff]" : "text-white/40"} />
                <span className={`text-[9px] font-medium ${isActive("/marketplace") ? "text-[#5f8fff]" : "text-white/30"}`}>Shop</span>
              </Link>
            )}

            {/* Orders */}
            <Link href="/orders" className="flex flex-col items-center justify-center gap-0.5 pt-2 pb-1 flex-1 relative">
              <Package size={22} className={isActive("/orders") ? "text-[#5f8fff]" : "text-white/40"} />
              {hasUnseenOrders && (
                <span className="absolute top-1 right-1/4 w-2 h-2 bg-[#5f8fff] rounded-full" />
              )}
              <span className={`text-[9px] font-medium ${isActive("/orders") ? "text-[#5f8fff]" : "text-white/30"}`}>Orders</span>
            </Link>

            {/* More / Menu */}
            <button
              onClick={() => setSheetOpen(!sheetOpen)}
              className="flex flex-col items-center justify-center gap-0.5 pt-2 pb-1 flex-1"
            >
              {sheetOpen ? (
                <X size={22} className="text-[#5f8fff]" />
              ) : (
                <div className="relative">
                  <Menu size={22} className="text-white/40" />
                  {hasUnreadMessages && (
                    <span className="absolute -top-1 -right-1 w-2 h-2 bg-[#5f8fff] rounded-full" />
                  )}
                </div>
              )}
              <span className={`text-[9px] font-medium ${sheetOpen ? "text-[#5f8fff]" : "text-white/30"}`}>More</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
