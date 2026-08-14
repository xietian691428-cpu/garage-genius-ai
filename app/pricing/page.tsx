import { headers } from "next/headers";
import PricingPageClient from "./PricingPageClient";
import { userAgentLooksNative } from "@/lib/native-platform";

export default async function PricingPage() {
  const forceStoreSafe = userAgentLooksNative((await headers()).get("user-agent"));
  return <PricingPageClient forceStoreSafe={forceStoreSafe} />;
}
