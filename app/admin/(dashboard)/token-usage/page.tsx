import { redirect } from "next/navigation";

export default function LegacyTokenUsageRedirect() {
  redirect("/admin/ops/tokens");
}
