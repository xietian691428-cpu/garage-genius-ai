import { headers } from "next/headers";
import LoginClient from "./LoginClient";
import { userAgentLooksNative } from "@/lib/native-platform";

export default async function LoginPage() {
  const forceStoreSafe = userAgentLooksNative((await headers()).get("user-agent"));
  return <LoginClient forceStoreSafe={forceStoreSafe} />;
}
