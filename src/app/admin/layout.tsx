import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { requireAdminSession } from "@/lib/admin-access";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    await requireAdminSession();
  } catch {
    redirect("/");
  }

  return <AppShell>{children}</AppShell>;
}
