import PricingPageClient from "./PricingPageClient";
import { readForceStoreSafe } from "@/lib/store-shell-request";

export default async function PricingPage() {
  const forceStoreSafe = await readForceStoreSafe();
  return <PricingPageClient forceStoreSafe={forceStoreSafe} />;
}
