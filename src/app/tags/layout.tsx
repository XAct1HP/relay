import { AppShell } from "@/components/layout/AppShell";

export default function TagsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}
