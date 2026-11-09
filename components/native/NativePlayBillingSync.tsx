"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { canUsePlayBilling } from "@/lib/native-platform";
import { syncPlayPurchasesQuietly } from "@/lib/native-play-billing";

/** Custom event — useSubscription refreshes profile after a quiet Play sync. */
export const GG_SUBSCRIPTION_REFRESH_EVENT = "gg-subscription-refresh";

const RESUME_THROTTLE_MS = 10 * 60 * 1000;

let lastQuietSyncAt = 0;

function notifySubscriptionRefresh(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(GG_SUBSCRIPTION_REFRESH_EVENT));
}

/**
 * Android Capacitor only: on cold start, sign-in, and (throttled) resume,
 * re-post local Play purchase tokens to /api/google/play/verify.
 * Manual Restore still uses restorePlayPurchases() (Play restore + sync).
 */
export default function NativePlayBillingSync() {
  useEffect(() => {
    if (!canUsePlayBilling()) return;

    let cancelled = false;
    let removeAppListener: (() => void) | undefined;

    const run = async (reason: "mount" | "signed_in" | "resume") => {
      const now = Date.now();
      if (reason === "resume" && now - lastQuietSyncAt < RESUME_THROTTLE_MS) {
        return;
      }
      lastQuietSyncAt = now;

      try {
        const { synced } = await syncPlayPurchasesQuietly();
        if (!cancelled && synced > 0) notifySubscriptionRefresh();
      } catch {
        /* quiet path must never surface */
      }
    };

    void run("mount");

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN") return;
      // Defer — awaiting auth APIs inside the callback can deadlock WKWebView /
      // Capacitor bridges on some devices.
      window.setTimeout(() => {
        if (!cancelled) void run("signed_in");
      }, 0);
    });

    void (async () => {
      try {
        const { App } = await import("@capacitor/app");
        const handle = await App.addListener(
          "appStateChange",
          ({ isActive }) => {
            if (isActive && !cancelled) void run("resume");
          },
        );
        removeAppListener = () => {
          void handle.remove();
        };
      } catch {
        /* App plugin unavailable — mount sync still runs */
      }
    })();

    return () => {
      cancelled = true;
      subscription.unsubscribe();
      removeAppListener?.();
    };
  }, []);

  return null;
}
