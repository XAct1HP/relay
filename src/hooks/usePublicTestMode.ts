"use client";

import { useEffect, useState } from "react";

export function usePublicTestMode() {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchStatus() {
      try {
        const response = await fetch("/api/test-mode/public", { cache: "no-store" });
        const data = await response.json();

        if (!cancelled) {
          setEnabled(!!data?.enabled);
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to load public test mode status", error);
          setEnabled(false);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchStatus();

    return () => {
      cancelled = true;
    };
  }, []);

  return { enabled, loading };
}
