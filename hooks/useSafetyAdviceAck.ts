"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import {
  readSafetyAdviceAckLocal,
  writeSafetyAdviceAckLocal,
} from "@/lib/safety-advice-ack";
import {
  AUTH_SESSION_TIMEOUT_MS,
  withTimeout,
} from "@/lib/auth-timeout";

/**
 * Account-level one-time high-tier safety acknowledgment.
 * needsAck becomes true only when opening high-tier content and not yet acknowledged.
 */
export function useSafetyAdviceAck() {
  const { user, loading: authLoading } = useAuth();
  const [acknowledged, setAcknowledged] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [pendingHigh, setPendingHigh] = useState(false);

  useEffect(() => {
    if (authLoading || !user?.id) {
      setAcknowledged(true);
      setLoaded(!authLoading);
      return;
    }
    if (readSafetyAdviceAckLocal(user.id)) {
      setAcknowledged(true);
      setLoaded(true);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const { data, error } = await withTimeout(
          Promise.resolve(
            supabase
              .from("profiles")
              .select("has_acknowledged_safety_advice")
              .eq("id", user.id)
              .maybeSingle(),
          ),
          AUTH_SESSION_TIMEOUT_MS,
        );
        if (cancelled) return;
        if (error) {
          if (
            /has_acknowledged_safety_advice|does not exist|schema cache/i.test(
              error.message,
            )
          ) {
            console.warn(
              "[safety-ack] column missing — apply migration 037_profiles_safety_advice_ack.sql",
            );
          }
          setAcknowledged(false);
          return;
        }
        const done = data?.has_acknowledged_safety_advice === true;
        if (done) writeSafetyAdviceAckLocal(user.id);
        setAcknowledged(done);
      } catch {
        if (!cancelled) setAcknowledged(false);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, user?.id]);

  const requestHighTierAccess = useCallback(() => {
    if (!loaded) return false;
    if (acknowledged) return true;
    setPendingHigh(true);
    return false;
  }, [loaded, acknowledged]);

  const acknowledge = useCallback(async () => {
    setPendingHigh(false);
    setAcknowledged(true);
    const uid = user?.id;
    if (!uid) return;
    writeSafetyAdviceAckLocal(uid);
    try {
      await withTimeout(
        Promise.resolve(
          supabase
            .from("profiles")
            .update({ has_acknowledged_safety_advice: true })
            .eq("id", uid),
        ),
        AUTH_SESSION_TIMEOUT_MS,
      );
    } catch (err) {
      console.warn("[safety-ack] persist failed", err);
    }
  }, [user?.id]);

  const cancelPending = useCallback(() => {
    setPendingHigh(false);
  }, []);

  return {
    loaded,
    acknowledged,
    showAckModal: pendingHigh && !acknowledged,
    requestHighTierAccess,
    acknowledge,
    cancelPending,
  };
}
