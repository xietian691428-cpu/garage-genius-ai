import AdminLayout from "@/components/admin/AdminLayout";
import { requireAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export default async function AdminRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();
  return <AdminLayout>{children}</AdminLayout>;
}
