"use client";

import { useEffect, useState } from "react";
import { fetchAppleProducts } from "@/lib/native-iap";
import {
  storeKitPriceByProductId,
} from "@/lib/storekit-price-display";

/** Localized App Store prices for the four subscription product IDs. */
export function useAppleStoreKitPrices(enabled: boolean) {
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(!enabled);

  useEffect(() => {
    if (!enabled) {
      setLoaded(true);
      return;
    }
    let cancelled = false;
    setLoaded(false);
    void (async () => {
      try {
        const products = await fetchAppleProducts();
        if (cancelled) return;
        setPrices(storeKitPriceByProductId(products));
      } catch (err) {
        console.warn("[iap] StoreKit product fetch failed", err);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { prices, loaded };
}
