import { redirect } from "next/navigation";

export default function LegacySupportRefundsRedirect() {
  redirect("/admin/ops/refunds");
}
