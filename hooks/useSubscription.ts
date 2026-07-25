"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  PHOTO_DAILY_COUNT_KEY,
  VOICE_DAILY_COUNT_KEY,
  type PlanEntitlements,
  type Profile,
  type SubscriptionStatus,
  type SubscriptionTier,
} from "@/lib/types/subscription";
import {
  consumeTrialExpiredPrompt,
  formatTrialCountdown,
  markTrialExpiredPromptPending,
  profileFromRow,
  resolveSubscription,
  shouldPersistTrialExpiry,
  type ResolvedSubscription,
} from "@/lib/subscription";
import { applyQaUnlock, isQaUnlockEnabled } from "@/lib/qa-mode";
import { PLAN_COOKIE } from "@/lib/subscription-guard";

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function readVoiceDailyCount(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = localStorage.getItem(VOICE_DAILY_COUNT_KEY);
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as { date?: string; count?: number };
    if (parsed.date !== todayKey()) return 0;
    return typeof parsed.count === "number" ? parsed.count : 0;
  } catch {
    return 0;
  }
}

function writeVoiceDailyCount(count: number) {
  localStorage.setItem(
    VOICE_DAILY_COUNT_KEY,
    JSON.stringify({ date: todayKey(), count }),
  );
}

function readPhotoDailyCount(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = localStorage.getItem(PHOTO_DAILY_COUNT_KEY);
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as { date?: string; count?: number };
    if (parsed.date !== todayKey()) return 0;
    return typeof parsed.count === "number" ? parsed.count : 0;
  } catch {
    return 0;
  }
}

function writePhotoDailyCount(count: number) {
  localStorage.setItem(
    PHOTO_DAILY_COUNT_KEY,
    JSON.stringify({ date: todayKey(), count }),
  );
}

export type SubscriptionFeatures = PlanEntitlements & {
  isPro: boolean;
  isHeavy: boolean;
  isFree: boolean;
  canUseVoice: boolean;
  voiceRemainingToday: number;
  /** Photo diagnose available (Free soft-capped; Pro unlimited) */
  canUsePhotoDiagnose: boolean;
  photoRemainingToday: number | null;
  canAddVehicle: (currentCount: number) => boolean;
};

export function useSubscription() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [voiceUsedToday, setVoiceUsedToday] = useState(0);
  const [photoUsedToday, setPhotoUsedToday] = useState(0);
  const [showTrialEndedPrompt, setShowTrialEndedPrompt] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setProfile(null);
        return;
      }

      const { data: before } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

      if (before && shouldPersistTrialExpiry(before as Profile)) {
        markTrialExpiredPromptPending(
          (before as Profile).trial_ends_at,
        );
      }

      const { data: synced, error: syncError } = await supabase.rpc(
        "sync_my_trial_status",
      );

      let next: Profile | null = null;
      if (!syncError && synced) {
        next = profileFromRow(synced as unknown as Record<string, unknown>);
      } else {
        if (syncError) {
          console.warn(
            "[useSubscription] sync_my_trial_status:",
            syncError.message,
          );
        }
        next = (before as Profile | null) ?? null;
      }

      setProfile(next);

      if (!isQaUnlockEnabled() && consumeTrialExpiredPrompt()) {
        setShowTrialEndedPrompt(true);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    setVoiceUsedToday(readVoiceDailyCount());
    setPhotoUsedToday(readPhotoDailyCount());

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void refresh();
    });

    const timer = window.setInterval(() => setNowMs(Date.now()), 60_000);

    return () => {
      subscription.unsubscribe();
      window.clearInterval(timer);
    };
  }, [refresh]);

  const resolved: ResolvedSubscription = useMemo(() => {
    void nowMs;
    return applyQaUnlock(resolveSubscription(profile));
  }, [profile, nowMs]);

  // Soft paywall cookie for middleware (AuthGate still owns real auth)
  useEffect(() => {
    if (typeof document === "undefined") return;
    const value = resolved.isPro ? resolved.tier : "free";
    document.cookie = `${PLAN_COOKIE}=${value}; Path=/; Max-Age=${60 * 60 * 24 * 7}; SameSite=Lax`;
  }, [resolved.isPro, resolved.tier]);

  const status: SubscriptionStatus = resolved.status;
  const tier: SubscriptionTier = resolved.tier;
  const base = resolved.entitlements;

  const voiceRemainingToday = Math.max(
    0,
    base.voiceDailyLimit - voiceUsedToday,
  );

  const canUseVoice =
    base.voiceEnabled &&
    (isQaUnlockEnabled() ||
      base.voiceDailyLimit <= 0 ||
      voiceRemainingToday > 0);

  // photoDailyLimit === 0 → unlimited (Pro / Heavy / QA)
  const photoUnlimited =
    isQaUnlockEnabled() || base.photoDailyLimit <= 0 || resolved.isPro;
  const photoRemainingToday = photoUnlimited
    ? null
    : Math.max(0, base.photoDailyLimit - photoUsedToday);
  const canUsePhotoDiagnose =
    photoUnlimited || (photoRemainingToday !== null && photoRemainingToday > 0);

  const features: SubscriptionFeatures = {
    ...base,
    isPro: resolved.isPro,
    isHeavy: resolved.isHeavy,
    isFree: resolved.isFree,
    canUseVoice,
    voiceRemainingToday,
    canUsePhotoDiagnose,
    photoRemainingToday,
    canAddVehicle: (currentCount: number) => currentCount < base.maxVehicles,
  };

  const recordVoiceUse = useCallback(() => {
    if (!base.voiceEnabled) return false;
    if (isQaUnlockEnabled()) return true;
    if (base.voiceDailyLimit <= 0) return true;
    const next = readVoiceDailyCount() + 1;
    if (next > base.voiceDailyLimit) {
      setVoiceUsedToday(base.voiceDailyLimit);
      return false;
    }
    writeVoiceDailyCount(next);
    setVoiceUsedToday(next);
    return true;
  }, [base.voiceEnabled, base.voiceDailyLimit]);

  const recordPhotoDiagnose = useCallback(() => {
    if (isQaUnlockEnabled() || resolved.isPro || base.photoDailyLimit <= 0) {
      return true;
    }
    const next = readPhotoDailyCount() + 1;
    if (next > base.photoDailyLimit) {
      setPhotoUsedToday(base.photoDailyLimit);
      return false;
    }
    writePhotoDailyCount(next);
    setPhotoUsedToday(next);
    return true;
  }, [base.photoDailyLimit, resolved.isPro]);

  const dismissTrialEndedPrompt = useCallback(() => {
    setShowTrialEndedPrompt(false);
  }, []);

  return {
    profile,
    loading,
    status,
    tier,
    features,
    resolved,
    isPro: features.isPro,
    isHeavy: features.isHeavy,
    isFree: features.isFree,
    isTrialing: resolved.isTrialing,
    trialCountdown: formatTrialCountdown(resolved),
    trialDaysRemaining: resolved.trialDaysRemaining,
    showTrialEndedPrompt,
    dismissTrialEndedPrompt,
    refresh,
    recordVoiceUse,
    recordPhotoDiagnose,
  };
}
