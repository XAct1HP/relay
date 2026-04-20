"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { isLoading, fetchUser } = useAuth();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    fetchUser();
  }, [fetchUser]);

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
