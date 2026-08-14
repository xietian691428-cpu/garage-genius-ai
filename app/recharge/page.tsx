import RechargePageClient from "./RechargePageClient";
import { readForceStoreSafe } from "@/lib/store-shell-request";

export default async function RechargePage() {
  const forceStoreSafe = await readForceStoreSafe();
  return <RechargePageClient forceStoreSafe={forceStoreSafe} />;
}
