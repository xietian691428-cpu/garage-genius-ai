import { headers } from "next/headers";
import RechargePageClient from "./RechargePageClient";
import { userAgentLooksNative } from "@/lib/native-platform";

export default async function RechargePage() {
  const forceStoreSafe = userAgentLooksNative((await headers()).get("user-agent"));
  return <RechargePageClient forceStoreSafe={forceStoreSafe} />;
}
