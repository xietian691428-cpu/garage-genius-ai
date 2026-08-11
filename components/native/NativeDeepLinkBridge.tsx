"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { isNativeCapacitor } from "@/lib/native-platform";

/**
 * Maps custom scheme / Universal Link opens into in-app Next.js routes.
 * Safe no-op on web. Requires @capacitor/app in the native shell.
 */
export default function NativeDeepLinkBridge() {
  const router = useRouter();

  useEffect(() => {
    if (!isNativeCapacitor()) return;

    let remove: (() => void) | undefined;

    void (async () => {
      try {
        const { App } = await import("@capacitor/app");

        const go = (url: string) => {
          try {
            const parsed = new URL(url);
            // Custom scheme: garagegenius://auth/callback?...
            if (parsed.protocol === "garagegenius:") {
              const path = `/${parsed.host}${parsed.pathname}`.replace(
                /\/+/g,
                "/",
              );
              void (async () => {
                try {
                  const { Browser } = await import("@capacitor/browser");
                  await Browser.close();
                } catch {
                  /* ignore */
                }
              })();
              router.push(`${path}${parsed.search}${parsed.hash}`);
              return;
            }
            // Universal Links on our domain
            if (
              parsed.hostname === "garagegenius.cloud" ||
              parsed.hostname.endsWith(".garagegenius.cloud")
            ) {
              void (async () => {
                try {
                  const { Browser } = await import("@capacitor/browser");
                  await Browser.close();
                } catch {
                  /* ignore */
                }
              })();
              router.push(`${parsed.pathname}${parsed.search}${parsed.hash}`);
            }
          } catch {
            // ignore malformed URLs
          }
        };

        const launch = await App.getLaunchUrl();
        if (launch?.url) go(launch.url);

        const handle = await App.addListener("appUrlOpen", ({ url }) => {
          go(url);
        });
        remove = () => {
          void handle.remove();
        };
      } catch {
        // Capacitor App plugin unavailable — ignore
      }
    })();

    return () => {
      remove?.();
    };
  }, [router]);

  return null;
}
