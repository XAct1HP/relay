"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { isLoading, fetchUser } = useAuth();
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();

  // Mobile capture routes manage their own auth/bootstrap flow so they should
  // never be blocked behind the app shell loading screen.
  const isMobileCaptureRoute =
    pathname.startsWith("/mobile-auth") || pathname.startsWith("/mobile-order-review");

  useEffect(() => {
    setMounted(true);
    if (!isMobileCaptureRoute) {
      fetchUser();
    }
  }, [fetchUser, isMobileCaptureRoute]);

  // Never block rendering for mobile capture routes
  if (isMobileCaptureRoute) {
    return <>{children}</>;
  }

  if (!mounted || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-relay-bg">
        <div className="text-center">
          <div className="mb-6 flex justify-center">
            <div className="relative w-16 h-16">
              <div className="absolute inset-0 rounded-full border-2 border-white/20"></div>
              <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-relay-accent animate-spin"></div>
            </div>
          </div>
          <div className="text-relay-text text-lg font-semibold tracking-tight">
            Relay
          </div>
          <p className="text-white/40 text-sm mt-2">Loading...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
