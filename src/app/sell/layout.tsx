import { AppShell } from "@/components/layout/AppShell";

export const metadata = {
  title: "Sell",
  description: "Create a listing and start selling your shoes on Relay",
};

export default function SellLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
