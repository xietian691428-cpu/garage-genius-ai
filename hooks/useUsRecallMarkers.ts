"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { VehicleInfo } from "@/lib/types/chat";
import { isNhtsaRecallMarket } from "@/lib/vehicle-data/recall-copy";
import { fetchSafetyHintsClient } from "@/lib/vehicle-data/safety-hints-client";

/** US vehicles whose NHTSA YMM query returned at least one campaign. */
export function useUsRecallMarkers(vehicles: VehicleInfo[]): Set<string> {
  const usKeys = useMemo(() => {
    const seen = new Set<string>();
    const rows: VehicleInfo[] = [];
    for (const v of vehicles) {
      if (!isNhtsaRecallMarket(v.market)) continue;
      const key = `${v.year}|${v.make}|${v.model}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(v);
    }
    return rows;
  }, [vehicles]);

  const [ids, setIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!usKeys.length) {
        setIds(new Set());
        return;
      }
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const marked = new Set<string>();
      await Promise.all(
        usKeys.map(async (v) => {
          try {
            const payload = await fetchSafetyHintsClient({
              year: v.year,
              make: v.make,
              model: v.model,
              market: v.market,
              accessToken: session.access_token,
            });
            if (
              !payload.skipped &&
              !payload.unavailable &&
              (payload.total > 0 || payload.hints.length > 0)
            ) {
              for (const other of vehicles) {
                if (
                  isNhtsaRecallMarket(other.market) &&
                  other.year === v.year &&
                  other.make === v.make &&
                  other.model === v.model
                ) {
                  marked.add(other.id);
                }
              }
            }
          } catch {
            /* fail-open: no badge */
          }
        }),
      );
      if (!cancelled) setIds(marked);
    })();
    return () => {
      cancelled = true;
    };
  }, [usKeys, vehicles]);

  return ids;
}
