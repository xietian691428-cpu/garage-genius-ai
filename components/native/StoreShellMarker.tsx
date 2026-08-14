"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  hideStorePurchaseUi,
  NATIVE_STORE_SHELL_COOKIE,
} from "@/lib/native-platform";

/**
 * Persist store-shell detection for SSR (Landing / Terms / Login).
 * Without GarageGeniusNative UA, first HTML can still be web marketing —
 * cookie + refresh closes that gap after Capacitor injects.
 */
export default function StoreShellMarker() {
  const router = useRouter();

  useEffect(() => {
    if (!hideStorePurchaseUi()) return;

    const key = `${NATIVE_STORE_SHELL_COOKIE}=1`;
    const hasCookie = document.cookie
      .split(";")
      .some((part) => part.trim() === key);
    if (hasCookie) return;

    document.cookie = `${NATIVE_STORE_SHELL_COOKIE}=1; Path=/; Max-Age=31536000; SameSite=Lax`;
    router.refresh();
  }, [router]);

  return null;
}
