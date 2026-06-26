import { AppShell } from "@/components/layout/AppShell";

export const metadata = {
  title: "Feed",
};

export default function FeedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}
