import { AppShell } from "@/components/layout/AppShell";

export default function ListingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}
