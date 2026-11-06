"use client";

import { useEffect, useState } from "react";
import { fetchPlayProducts } from "@/lib/native-play-billing";

/** Localized Play prices keyed by subscription product id. */
export function usePlayProductPrices(enabled: boolean) {
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
        const products = await fetchPlayProducts();
        if (cancelled) return;
        const next: Record<string, string> = {};
        for (const product of products) {
          const id = product.planIdentifier?.trim() || product.identifier?.trim();
          const price = product.priceString?.trim();
          if (id && price) next[id] = price;
        }
        setPrices(next);
      } catch (err) {
        console.warn("[play] product fetch failed", err instanceof Error ? err.name : "error");
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
