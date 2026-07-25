import { redirect } from "next/navigation";

export default function LegacyRevenueRedirect() {
  redirect("/admin/ops/revenue");
}
