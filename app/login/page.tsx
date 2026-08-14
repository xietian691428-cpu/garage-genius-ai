import LoginClient from "./LoginClient";
import { readForceStoreSafe } from "@/lib/store-shell-request";

export default async function LoginPage() {
  const forceStoreSafe = await readForceStoreSafe();
  return <LoginClient forceStoreSafe={forceStoreSafe} />;
}
