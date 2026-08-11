"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import {
  readWelcomeNoteSeenLocal,
  writeWelcomeNoteSeenLocal,
} from "@/lib/welcome-note";
import {
  AUTH_SESSION_TIMEOUT_MS,
  withTimeout,
} from "@/lib/auth-timeout";

/**
 * Shows the early-access welcome note once per account after the main app shell is ready.
 */
export function useWelcomeNote(opts: { enabled: boolean }) {
  const { user, loading: authLoading } = useAuth();
  const [open, setOpen] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!opts.enabled || authLoading || !user?.id) {
      setOpen(false);
      return;
    }

    if (readWelcomeNoteSeenLocal(user.id)) {
      setOpen(false);
      return;
    }

    let cancelled = false;
    setChecking(true);

    void (async () => {
      try {
        const { data, error } = await withTimeout(
          Promise.resolve(
            supabase
              .from("profiles")
              .select("has_seen_welcome_note")
              .eq("id", user.id)
              .maybeSingle(),
          ),
          AUTH_SESSION_TIMEOUT_MS,
          "Welcome note check timed out",
        );

        if (cancelled) return;

        if (error) {
          // Column missing or network — fail soft: still show once via local mark path
          if (/has_seen_welcome_note|does not exist|schema cache/i.test(error.message)) {
            console.warn(
              "[welcome-note] column missing — apply migration 036_profiles_welcome_note.sql",
            );
          }
          setOpen(true);
          return;
        }

        if (data?.has_seen_welcome_note === true) {
          writeWelcomeNoteSeenLocal(user.id);
          setOpen(false);
          return;
        }

        setOpen(true);
      } catch (err) {
        console.warn("[welcome-note] check failed", err);
        if (!cancelled) setOpen(true);
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [opts.enabled, authLoading, user?.id]);

  const dismiss = useCallback(async () => {
    setOpen(false);
    const uid = user?.id;
    if (!uid) return;

    writeWelcomeNoteSeenLocal(uid);

    try {
      const { error } = await withTimeout(
        Promise.resolve(
          supabase
            .from("profiles")
            .update({ has_seen_welcome_note: true })
            .eq("id", uid),
        ),
        AUTH_SESSION_TIMEOUT_MS,
      );
      if (error) {
        console.warn("[welcome-note] persist failed:", error.message);
      }
    } catch (err) {
      console.warn("[welcome-note] persist timed out", err);
    }
  }, [user?.id]);

  return { open, checking, dismiss };
}
