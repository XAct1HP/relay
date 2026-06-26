import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/AppShell";

export const metadata = {
  title: "Inventory",
  description: "Manage seller inventory tools",
};

export default function InventoryLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
