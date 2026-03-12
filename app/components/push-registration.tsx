"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { createClient } from "@/lib/supabase/client";

export default function PushRegistration() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const supabase = createClient();

    const initPush = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) return;

        // Check if token already exists for this user
        const { data: existingToken } = await supabase
          .from("device_push_tokens")
          .select("token")
          .eq("user_id", user.id)
          .limit(1)
          .maybeSingle();

        // If token exists, do nothing
        if (existingToken?.token) {
          return;
        }

        // Check notification permission
        const permission = await PushNotifications.checkPermissions();
        let status = permission.receive;

        if (status === "denied") {
          console.log("User previously denied push notifications");
          return;
        }

        if (status === "prompt") {
          const req = await PushNotifications.requestPermissions();
          status = req.receive;
        }

        if (status !== "granted") {
          return;
        }

        await PushNotifications.register();

        PushNotifications.addListener("registration", async (token) => {
          console.log("Push token:", token.value);

          await supabase.from("device_push_tokens").upsert({
            user_id: user.id,
            token: token.value,
            platform: Capacitor.getPlatform(),
          });
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
            const data = action.notification.data;

            if (data?.type === "message" && data?.conversation_id) {
              window.location.href = `/messages/${data.conversation_id}`;
              return;
            }

            if (data?.type === "order" && data?.order_id) {
              window.location.href = `/orders/${data.order_id}`;
            }
          }
        );
      } catch (err) {
        console.error("Push setup failed:", err);
      }
    };

    initPush();
  }, []);

  return null;
}