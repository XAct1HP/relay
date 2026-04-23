"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { MobileBottomBar } from "./MobileBottomBar";
import { useSidebarStore } from "@/store/sidebarStore";
import { useAuth } from "@/hooks/useAuth";

// Routes accessible without authentication
const PUBLIC_ROUTES = ["/", "/marketplace", "/auth/login", "/auth/signup", "/listing", "/onboarding", "/profile", "/mobile-auth"];

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some((route) => {
    if (route === "/") return pathname === "/";
    return pathname.startsWith(route);
  });
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { isCollapsed } = useSidebarStore();
  const { currentUser, isLoading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

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

  return (
    <div className="relative min-h-screen">
      {/* Sidebar */}
      <div className="hidden lg:block">
        <Sidebar />
      </div>

      {/* Main Content */}
      <main
        className={`transition-all duration-300 ${
          isCollapsed ? "lg:ml-20" : "lg:ml-64"
        } pt-0`}
      >
        {/* Mobile Top Bar */}
        <div className="lg:hidden fixed top-0 left-0 right-0 h-[72px] bg-relay-bg/80 backdrop-blur-xl border-b border-white/10 z-30 flex items-center px-4 gap-4">
          <button className="p-2 rounded-lg hover:bg-white/[0.08] transition-colors">
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
          <div className="font-bold text-lg tracking-tight text-relay-text">
            Relay
          </div>
        </div>

        {/* Content Area */}
        <div className="pt-[72px] lg:pt-8 pb-[80px] lg:pb-8 px-6 md:px-10">
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
