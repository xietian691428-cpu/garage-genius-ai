import { cookies, headers } from "next/headers";
import {
  NATIVE_STORE_SHELL_COOKIE,
  requestLooksStoreShell,
} from "@/lib/native-platform";

/** True when this request is Capacitor / store shell (UA and/or cookie). */
export async function readForceStoreSafe(): Promise<boolean> {
  const [headerStore, cookieStore] = await Promise.all([headers(), cookies()]);
  return requestLooksStoreShell({
    userAgent: headerStore.get("user-agent"),
    storeShellCookie: cookieStore.get(NATIVE_STORE_SHELL_COOKIE)?.value,
  });
}
