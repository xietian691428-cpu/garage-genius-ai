import LandingPage from "@/components/landing/LandingPage";
import { readForceStoreSafe } from "@/lib/store-shell-request";

export default async function Home() {
  const forceStoreSafe = await readForceStoreSafe();
  return <LandingPage forceStoreSafe={forceStoreSafe} />;
}
