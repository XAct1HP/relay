"use client";

import { ReactNode, useEffect, useState } from "react";
import Navbar from "@/app/components/navbar";
import MobileBottomNav from "@/app/components/mobile-bottom-nav";
import { isNativeApp } from "@/lib/is-native";

export default function AppShell({ children }: { children: ReactNode }) {
  const [nativeApp, setNativeApp] = useState(false);

  useEffect(() => {
    setNativeApp(isNativeApp());
  }, []);

  return (
    <div className="relative isolate min-h-screen">
      {!nativeApp && <Navbar />}
      <div className="relative z-10 pb-24 md:pb-0">{children}</div>
      <MobileBottomNav nativeApp={nativeApp} />
    </div>
  );
}