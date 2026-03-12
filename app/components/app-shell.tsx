import { ReactNode } from "react";
import Navbar from "@/app/components/navbar";
import MobileBottomNav from "@/app/components/mobile-bottom-nav";
import NativeNavbarGuard from "@/app/components/native-navbar-guard";

export default function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative isolate min-h-screen">
      <NativeNavbarGuard>
        <Navbar />
      </NativeNavbarGuard>

      <div className="relative z-10 pb-24 md:pb-0">{children}</div>

      <MobileBottomNav />
    </div>
  );
}