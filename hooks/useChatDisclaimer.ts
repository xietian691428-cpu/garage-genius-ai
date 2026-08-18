"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import {
  AUTH_SESSION_TIMEOUT_MS,
  withTimeout,
} from "@/lib/auth-timeout";
import {
  readChatDisclaimerLocal,
  shouldShowChatDisclaimerBanner,
  writeChatDisclaimerLocal,
  type ChatDisclaimerLocalState,
} from "@/lib/chat-disclaimer";

/**
 * Chat Safety & Disclaimer banner preference (not DeepSeek AI consent).
 */
export function useChatDisclaimer(assistantCountNow: number) {
  const { user, loading: authLoading } = useAuth();
  const [local, setLocal] = useState<ChatDisclaimerLocalState>({
    ackAt: null,
    assistantCountAtAck: 0,
  });
  const [loaded, setLoaded] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  /** User closed the banner this session without waiting for persist. */
  const [sessionHidden, setSessionHidden] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user?.id) {
      setLocal({ ackAt: null, assistantCountAtAck: 0 });
      setLoaded(true);
      return;
    }

    const cached = readChatDisclaimerLocal(user.id);
    if (cached.ackAt) {
      setLocal(cached);
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
              .select(
                "chat_disclaimer_ack_at, chat_disclaimer_assistant_count_at_ack",
              )
              .eq("id", user.id)
              .maybeSingle(),
          ),
          AUTH_SESSION_TIMEOUT_MS,
        );
        if (cancelled) return;
        if (error) {
          if (
            /chat_disclaimer_ack_at|does not exist|schema cache/i.test(
              error.message,
            )
          ) {
            console.warn(
              "[chat-disclaimer] column missing — apply migration 051_chat_disclaimer_ack.sql",
            );
          }
          setLocal(cached);
          return;
        }
        const next: ChatDisclaimerLocalState = {
          ackAt: data?.chat_disclaimer_ack_at ?? null,
          assistantCountAtAck:
            data?.chat_disclaimer_assistant_count_at_ack ?? 0,
        };
        if (next.ackAt) writeChatDisclaimerLocal(user.id, next);
        setLocal(next);
      } catch {
        if (!cancelled) setLocal(cached);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, user?.id]);

  const decision = useMemo(
    () =>
      shouldShowChatDisclaimerBanner({
        ackAt: local.ackAt,
        assistantCountAtAck: local.assistantCountAtAck,
        assistantCountNow,
      }),
    [local.ackAt, local.assistantCountAtAck, assistantCountNow],
  );

  const showBanner = loaded && decision.show && !sessionHidden;

  const dismiss = useCallback(async () => {
    setSessionHidden(true);
    const uid = user?.id;
    const next: ChatDisclaimerLocalState = {
      ackAt: new Date().toISOString(),
      assistantCountAtAck: assistantCountNow,
    };
    setLocal(next);
    if (!uid) return;
    writeChatDisclaimerLocal(uid, next);
    try {
      await withTimeout(
        Promise.resolve(
          supabase
            .from("profiles")
            .update({
              chat_disclaimer_ack_at: next.ackAt,
              chat_disclaimer_assistant_count_at_ack: next.assistantCountAtAck,
            })
            .eq("id", uid),
        ),
        AUTH_SESSION_TIMEOUT_MS,
      );
    } catch (err) {
      console.warn("[chat-disclaimer] persist failed", err);
    }
  }, [user?.id, assistantCountNow]);

  const openSheet = useCallback(() => setSheetOpen(true), []);
  const closeSheet = useCallback(() => setSheetOpen(false), []);

  return {
    loaded,
    showBanner,
    bannerMode: decision.mode,
    sheetOpen,
    openSheet,
    closeSheet,
    dismiss,
  };
}
