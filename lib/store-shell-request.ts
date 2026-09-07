import { cookies, headers } from "next/headers";
import {
  NATIVE_STORE_SHELL_COOKIE,
  requestLooksStoreShell,
  storeShellPlatformFromRequest,
  type CapacitorPlatformId,
} from "@/lib/native-platform";

async function storeShellRequestInput(): Promise<{
  userAgent: string | null;
  storeShellCookie: string | undefined;
}> {
  const [headerStore, cookieStore] = await Promise.all([headers(), cookies()]);
  return {
    userAgent: headerStore.get("user-agent"),
    storeShellCookie: cookieStore.get(NATIVE_STORE_SHELL_COOKIE)?.value,
  };
}

/** True when this request is Capacitor / store shell (UA and/or cookie). */
export async function readForceStoreSafe(): Promise<boolean> {
  const input = await storeShellRequestInput();
  return requestLooksStoreShell(input);
}

/** ios / android for store WebViews; web otherwise. */
export async function readStoreShellPlatform(): Promise<CapacitorPlatformId> {
  return storeShellPlatformFromRequest(await storeShellRequestInput());
}
