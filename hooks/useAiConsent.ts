"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import {
  readAiConsentLocal,
  shouldAutoShowAiConsent,
  writeAiConsentLocal,
} from "@/lib/ai-consent";
import {
  AUTH_SESSION_TIMEOUT_MS,
  withTimeout,
} from "@/lib/auth-timeout";

type Waiter = {
  resolve: (ok: boolean) => void;
};

/**
 * Mandatory consent before first DeepSeek-backed request.
 * ensureConsent() resolves true only after the user accepts (or already accepted).
 */
export function useAiConsent() {
  const { user, loading: authLoading } = useAuth();
  const [acknowledged, setAcknowledged] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const acknowledgedRef = useRef(false);
  const waiterRef = useRef<Waiter | null>(null);
  const loadedRef = useRef(false);
  const loadedWaitersRef = useRef<Array<() => void>>([]);

  const mark = useCallback((done: boolean) => {
    acknowledgedRef.current = done;
    setAcknowledged(done);
  }, []);

  const markLoaded = useCallback((done: boolean) => {
    loadedRef.current = done;
    setLoaded(done);
    if (done) {
      const waiters = loadedWaitersRef.current;
      loadedWaitersRef.current = [];
      waiters.forEach((fn) => fn());
    }
  }, []);

  useEffect(() => {
    if (authLoading) {
      markLoaded(false);
      return;
    }
    if (!user?.id) {
      mark(true);
      markLoaded(true);
      return;
    }
    if (readAiConsentLocal(user.id)) {
      mark(true);
      markLoaded(true);
      return;
    }

    let cancelled = false;
    markLoaded(false);
    void (async () => {
      try {
        const { data, error } = await withTimeout(
          Promise.resolve(
            supabase
              .from("profiles")
              .select("has_acknowledged_ai_consent")
              .eq("id", user.id)
              .maybeSingle(),
          ),
          AUTH_SESSION_TIMEOUT_MS,
        );
        if (cancelled) return;
        if (error) {
          if (
            /has_acknowledged_ai_consent|does not exist|schema cache/i.test(
              error.message,
            )
          ) {
            console.warn(
              "[ai-consent] column missing — apply migration 050_apple_iap_and_ai_consent.sql",
            );
          }
          mark(false);
          return;
        }
        const done = data?.has_acknowledged_ai_consent === true;
        if (done) writeAiConsentLocal(user.id);
        mark(done);
      } catch {
        if (!cancelled) mark(false);
      } finally {
        if (!cancelled) markLoaded(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, user?.id, mark, markLoaded]);

  useEffect(() => {
    if (
      shouldAutoShowAiConsent({
        loaded,
        hasUser: Boolean(user?.id),
        acknowledged,
      })
    ) {
      setShowModal(true);
    }
  }, [loaded, user?.id, acknowledged]);

  const finishWaiter = useCallback((ok: boolean) => {
    const w = waiterRef.current;
    waiterRef.current = null;
    w?.resolve(ok);
  }, []);

  const ensureConsent = useCallback(async (): Promise<boolean> => {
    if (!loadedRef.current) {
      await new Promise<void>((resolve) => {
        loadedWaitersRef.current.push(resolve);
      });
    }
    if (acknowledgedRef.current) return true;
    setShowModal(true);
    return new Promise<boolean>((resolve) => {
      waiterRef.current = { resolve };
    });
  }, []);

  const acknowledge = useCallback(async () => {
    mark(true);
    setShowModal(false);
    const uid = user?.id;
    if (uid) {
      writeAiConsentLocal(uid);
      try {
        await withTimeout(
          Promise.resolve(
            supabase
              .from("profiles")
              .update({
                has_acknowledged_ai_consent: true,
                ai_consent_at: new Date().toISOString(),
              })
              .eq("id", uid),
          ),
          AUTH_SESSION_TIMEOUT_MS,
        );
      } catch (err) {
        console.warn("[ai-consent] persist failed", err);
      }
    }
    finishWaiter(true);
  }, [user?.id, mark, finishWaiter]);

  const decline = useCallback(() => {
    setShowModal(false);
    finishWaiter(false);
  }, [finishWaiter]);

  return {
    loaded,
    acknowledged,
    showModal: showModal && !acknowledged,
    ensureConsent,
    acknowledge,
    decline,
  };
}
