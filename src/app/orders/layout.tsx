import { AppShell } from "@/components/layout/AppShell"

export const metadata = {
  title: "Orders",
  description: "Manage your shoe orders",
}

export default function OrdersLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <AppShell>{children}</AppShell>
}
