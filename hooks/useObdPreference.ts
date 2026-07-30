"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import type { ObdAdapterPreference } from "@/lib/obd-preference";

const DEFAULT_PREF: ObdAdapterPreference = {
  hasObdAdapter: false,
  preferenceUnset: true,
  source: "default",
};

/**
 * Load / update profiles.has_obd_adapter for Settings, Chat, Dashboard, OBD modal.
 */
export function useObdPreference() {
  const { session } = useAuth();
  const [pref, setPref] = useState<ObdAdapterPreference>(DEFAULT_PREF);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!session?.access_token) {
      setPref(DEFAULT_PREF);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/obd-preference", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const data = (await res.json()) as {
          hasObdAdapter?: boolean;
          preferenceUnset?: boolean;
          source?: string;
          updatedAt?: string | null;
        };
        setPref({
          hasObdAdapter: Boolean(data.hasObdAdapter),
          preferenceUnset: data.preferenceUnset !== false,
          source: data.source === "self" ? "self" : "default",
          updatedAt: data.updatedAt ?? null,
        });
      } else {
        setPref(DEFAULT_PREF);
      }
    } catch {
      setPref(DEFAULT_PREF);
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setHasObdAdapter = useCallback(
    async (hasObdAdapter: boolean) => {
      if (!session?.access_token) {
        throw new Error("Sign in required");
      }
      const res = await fetch("/api/obd-preference", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ hasObdAdapter }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error || "Could not save OBD preference.");
      }
      const next: ObdAdapterPreference = {
        hasObdAdapter,
        preferenceUnset: false,
        source: "self",
        updatedAt: new Date().toISOString(),
      };
      setPref(next);
      return next;
    },
    [session?.access_token],
  );

  return { pref, loading, refresh, setHasObdAdapter };
}
