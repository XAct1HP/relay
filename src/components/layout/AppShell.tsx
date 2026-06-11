"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Sidebar } from "./Sidebar";
import { MobileBottomBar } from "./MobileBottomBar";
import { useSidebarStore } from "@/store/sidebarStore";
import { useAuth } from "@/hooks/useAuth";
import { useNotificationStore } from "@/store/notificationStore";
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
  Rss,
  LogOut,
  ClipboardCheck,
  Users,
  Shield,
  ShieldCheck,
  X,
} from "lucide-react";

// Routes accessible without authentication
const PUBLIC_ROUTES = ["/", "/api", "/marketplace", "/auth/login", "/auth/signup", "/listing", "/onboarding", "/profile", "/mobile-auth"];

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some((route) => {
    if (route === "/") return pathname === "/";
    return pathname.startsWith(route);
  });
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { isCollapsed } = useSidebarStore();
  const { currentUser, isLoading, signOut } = useAuth();
  const { hasUnreadMessages, hasUnseenOrders } = useNotificationStore();
  const pathname = usePathname();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!isLoading && !currentUser && !isPublicRoute(pathname)) {
      router.replace("/auth/login");
    }
  }, [currentUser, isLoading, pathname, router]);

  // While checking auth for protected routes, show loading
  if (!isLoading && !currentUser && !isPublicRoute(pathname)) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-relay-bg">
        <div className="text-white/40">Redirecting to sign in...</div>
      </div>
    );
  }

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

  const getMobileLinks = () => {
    if (currentUser?.role === "admin") return adminLinks;
    if (currentUser?.role === "seller") return sellerLinks;
    return buyerLinks;
  };

  const mobileLinks = getMobileLinks();

  const isActive = (path: string) => {
    if (path === "/" && pathname === "/") return true;
    if (path === "/admin") return pathname === "/admin";
    if (path === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(path) && path !== "/";
  };

  return (
    <div className="relative min-h-screen">
      {/* Sidebar */}
      <div className="hidden lg:block">
        <Sidebar />
      </div>

      {/* Mobile Drawer Overlay */}
      {mobileMenuOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/60 z-40"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Mobile Drawer */}
      <div
        className={`lg:hidden fixed top-0 left-0 h-full w-72 bg-relay-bg/95 backdrop-blur-xl border-r border-white/10 z-50 transform transition-transform duration-300 ease-in-out ${
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        } flex flex-col`}
      >
        {/* Drawer Header */}
        <div className="h-[72px] flex items-center justify-between px-4 border-b border-white/10">
          <Image
            src="/branding/logo-darkmode.png"
            alt="Relay"
            width={88}
            height={32}
            className="object-contain"
            priority
          />
          <button
            onClick={() => setMobileMenuOpen(false)}
            className="p-2 rounded-lg hover:bg-white/[0.08] transition-colors text-white/60"
          >
            <X size={22} />
          </button>
        </div>

        {/* Drawer Nav Links */}
        <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-1">
          {mobileLinks.map((link) => {
            const Icon = link.icon;
            const active = isActive(link.href);
            const showDot =
              (link.href === "/messages" && hasUnreadMessages) ||
              (link.href === "/orders" && hasUnseenOrders);

            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center gap-3 py-3 px-4 rounded-lg transition-colors ${
                  active
                    ? "bg-relay-accent text-relay-bg"
                    : "text-white/60 hover:text-relay-text hover:bg-white/[0.04]"
                }`}
              >
                <span className="relative flex-shrink-0">
                  <Icon size={20} />
                  {showDot && (
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-blue-500 rounded-full border-2 border-relay-bg" />
                  )}
                </span>
                <span className="text-sm font-medium">{link.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Drawer User Info */}
        {currentUser && (
          <div className="px-3 py-4 border-t border-white/10 space-y-3">
            <div className="flex items-center gap-3 px-2">
              {currentUser.avatar_url ? (
                <img
                  src={currentUser.avatar_url}
                  alt={currentUser.display_name || currentUser.full_name}
                  className="w-10 h-10 rounded-full object-cover border border-white/10 flex-shrink-0"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-relay-accent flex items-center justify-center text-relay-bg font-semibold text-sm flex-shrink-0">
                  {currentUser.display_name?.[0]?.toUpperCase() || currentUser.full_name?.[0]?.toUpperCase() || "U"}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-relay-text truncate">
                  {currentUser.display_name || currentUser.full_name}
                </div>
                <div className="text-xs text-white/40 truncate capitalize">
                  {currentUser.role}
                </div>
              </div>
            </div>
            <button
              onClick={signOut}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <LogOut size={16} />
              Sign Out
            </button>
          </div>
        )}
      </div>

      {/* Main Content */}
      <main
        className={`transition-all duration-300 ${
          isCollapsed ? "lg:ml-20" : "lg:ml-64"
        } pt-0`}
      >
        {/* Mobile Top Bar */}
        <div className="lg:hidden fixed top-0 left-0 right-0 h-[72px] bg-relay-bg/80 backdrop-blur-xl border-b border-white/10 z-30 flex items-center px-4 gap-4">
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="p-2 rounded-lg hover:bg-white/[0.08] transition-colors"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="text-relay-text"
            >
              <line x1="3" y1="6" x2="21" y2="6"></line>
              <line x1="3" y1="12" x2="21" y2="12"></line>
              <line x1="3" y1="18" x2="21" y2="18"></line>
            </svg>
          </button>
          <Image
            src="/branding/logo-darkmode.png"
            alt="Relay"
            width={88}
            height={32}
            className="object-contain"
            priority
          />
        </div>

        {/* Content Area */}
        <div className="pt-[88px] lg:pt-8 pb-[calc(80px+env(safe-area-inset-bottom,0px))] lg:pb-8 px-4 sm:px-6 md:px-10">
          {children}
        </div>
      </main>

      {/* Mobile Bottom Navigation */}
      <div className="lg:hidden">
        <MobileBottomBar />
      </div>
    </div>
  );
}
