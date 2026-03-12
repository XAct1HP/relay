"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";

export default function PushRegistration() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const register = async () => {
      const perm = await PushNotifications.checkPermissions();

      let status = perm.receive;

      if (status === "prompt") {
        const req = await PushNotifications.requestPermissions();
        status = req.receive;
      }

      if (status !== "granted") {
        console.log("Push permission not granted");
        return;
      }

      await PushNotifications.register();

      PushNotifications.addListener("registration", token => {
        console.log("Push token:", token.value);

        // TODO: send this to your database
      });

      PushNotifications.addListener("registrationError", err => {
        console.error("Push registration error:", err);
      });

      PushNotifications.addListener("pushNotificationReceived", notif => {
        console.log("Push received:", notif);
      });

      PushNotifications.addListener(
        "pushNotificationActionPerformed",
        action => {
          console.log("Push action:", action);
        }
      );
    };

    register();
  }, []);

  return null;
}