import LandingPage from "@/components/landing/LandingPage";
import { headers } from "next/headers";
import { readForceStoreSafe } from "@/lib/store-shell-request";

export default async function Home() {
  const [forceStoreSafe, headerStore] = await Promise.all([
    readForceStoreSafe(),
    headers(),
  ]);
  return (
    <LandingPage
      forceStoreSafe={forceStoreSafe}
      nativeUserAgent={headerStore.get("user-agent")}
    />
  );
}
