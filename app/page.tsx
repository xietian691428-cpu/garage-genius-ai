import { headers } from "next/headers";
import LandingPage from "@/components/landing/LandingPage";
import { userAgentLooksNative } from "@/lib/native-platform";

export default async function Home() {
  const forceStoreSafe = userAgentLooksNative((await headers()).get("user-agent"));
  return <LandingPage forceStoreSafe={forceStoreSafe} />;
}
