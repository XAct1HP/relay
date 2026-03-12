"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useState } from "react";

type LogoutButtonProps = {
  compact?: boolean;
};

export default function LogoutButton({ compact = false }: LogoutButtonProps) {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    if (loading) return;

    setLoading(true);

    await supabase.auth.signOut();

    // Immediately redirect to login
    router.push("/auth/login");

    // Force React server components to update auth state
    router.refresh();
  }

  if (compact) {
    return (
      <button
        type="button"
        onClick={handleLogout}
        disabled={loading}
        aria-label="Log out"
        className="inline-flex h-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-medium text-white transition hover:bg-white/10 disabled:opacity-50"
      >
        {loading ? "..." : "Log out"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={loading}
      className="inline-flex min-h-10 items-center justify-center rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-white transition hover:bg-white/10 disabled:opacity-50"
    >
      {loading ? "Signing out..." : "Log out"}
    </button>
  );
}