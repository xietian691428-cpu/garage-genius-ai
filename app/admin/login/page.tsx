import { redirect } from "next/navigation";
import AdminLoginForm from "@/components/admin/AdminLoginForm";
import { isAdminAuthenticated } from "@/lib/admin-auth";

export default async function AdminLoginPage() {
  if (await isAdminAuthenticated()) {
    redirect("/admin");
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#0a0f1c] p-6">
      <AdminLoginForm />
    </div>
  );
}
