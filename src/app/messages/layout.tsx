import { AppShell } from "@/components/layout/AppShell";

export const metadata = {
  title: "Messages",
  description: "Manage your conversations with buyers and sellers",
};

export default function MessagesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}
