"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase";

export function useOnboardingPhase() {
  const [onboardingActive, setOnboardingActive] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchSetting() {
      const supabase = createClient();
      const { data } = await supabase
        .from("site_settings")
        .select("onboarding_active")
        .limit(1)
        .single();

      setOnboardingActive(data?.onboarding_active ?? false);
      setLoading(false);
    }

    fetchSetting();
  }, []);

  const toggleOnboarding = async (active: boolean) => {
    const supabase = createClient();

    // Get the settings row id
    const { data: settings } = await supabase
      .from("site_settings")
      .select("id")
      .limit(1)
      .single();

    if (!settings) return false;

    const { error } = await supabase
      .from("site_settings")
      .update({ onboarding_active: active, updated_at: new Date().toISOString() })
      .eq("id", settings.id);

    if (!error) {
      setOnboardingActive(active);
      return true;
    }
    return false;
  };

  return { onboardingActive, loading, toggleOnboarding };
}
