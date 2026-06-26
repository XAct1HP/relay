import { AppShell } from "@/components/layout/AppShell";

export const metadata = {
  title: "Tags",
};

export default function TagsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}
