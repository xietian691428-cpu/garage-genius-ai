"use client";

import { useEffect } from "react";
import { isNativeCapacitor } from "@/lib/native-platform";

/**
 * iPhone Safari keeps the URL bar at the bottom and overlays page content.
 * safe-area-inset-bottom only covers the home indicator — not Safari chrome.
 * Sync a CSS var so bottom UI (chat composer, etc.) stays above the browser bar.
 */
export function useBrowserChromeInset(): void {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isNativeCapacitor()) {
      document.documentElement.style.setProperty("--browser-chrome-bottom", "0px");
      return;
    }

    const root = document.documentElement;
    const vv = window.visualViewport;

    const sync = () => {
      if (!vv) {
        root.style.setProperty("--browser-chrome-bottom", "0px");
        return;
      }
      // Layout viewport vs visible area — positive when Safari/Chrome UI covers bottom.
      const obscured = Math.max(
        0,
        Math.round(window.innerHeight - vv.height - vv.offsetTop),
      );
      root.style.setProperty("--browser-chrome-bottom", `${obscured}px`);
    };

    sync();
    vv?.addEventListener("resize", sync);
    vv?.addEventListener("scroll", sync);
    window.addEventListener("resize", sync);
    window.addEventListener("orientationchange", sync);

    return () => {
      vv?.removeEventListener("resize", sync);
      vv?.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
    };
  }, []);
}
