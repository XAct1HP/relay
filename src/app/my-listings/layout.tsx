import type { ReactNode } from 'react'
import { AppShell } from "@/components/layout/AppShell"

export const metadata = {
  title: 'My Listings - Relay',
  description: 'Manage your shoe listings',
}

export default function MyListingsLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>
}
