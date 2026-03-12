"use client";

import { useEffect, useMemo, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { createClient } from "@/lib/supabase/client";

export default function PushRegistration() {
  const supabase = useMemo(() => createClient(), []);
  const currentTokenRef = useRef<string | null>(null);
  const listenersAttachedRef = useRef(false);

  async function saveTokenToSupabase(token: string) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const platform =
      Capacitor.getPlatform() === "ios"
        ? "ios"
        : Capacitor.getPlatform() === "android"
          ? "android"
          : "unknown";

    const { error } = await supabase.from("device_push_tokens").upsert(
      {
        user_id: user.id,
        token,
        platform,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "token",
      }
    );

    if (error) {
      console.error("Failed to save push token:", error);
    }
  }

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let authSubscription:
      | { unsubscribe: () => void }
      | undefined;

    const register = async () => {
      try {
        const permission = await PushNotifications.checkPermissions();
        let status = permission.receive;

        if (status === "prompt") {
          const req = await PushNotifications.requestPermissions();
          status = req.receive;
        }

        if (status !== "granted") {
          console.log("Push permission denied");
          return;
        }

        if (!listenersAttachedRef.current) {
          PushNotifications.addListener("registration", async (token) => {
            currentTokenRef.current = token.value;
            console.log("Push token:", token.value);
            await saveTokenToSupabase(token.value);
          });

          PushNotifications.addListener("registrationError", (error) => {
            console.error("Push registration error:", error);
          });

          PushNotifications.addListener(
            "pushNotificationReceived",
            (notification) => {
              console.log("Push received:", notification);
            }
          );

          PushNotifications.addListener(
            "pushNotificationActionPerformed",
            (action) => {
              console.log("Push action performed:", action);
            }
          );

          listenersAttachedRef.current = true;
        }

        await PushNotifications.register();

        const {
          data: { subscription },
        } = supabase.auth.onAuthStateChange(async (_event, session) => {
          if (session?.user && currentTokenRef.current) {
            await saveTokenToSupabase(currentTokenRef.current);
          }
        });

        authSubscription = subscription;
      } catch (err) {
        console.error("Push setup failed:", err);
      }
    };

    register();

    return () => {
      authSubscription?.unsubscribe();
    };
  }, [supabase]);

  return null;
}