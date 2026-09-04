"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  PHOTO_MONTHLY_COUNT_KEY,
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
import {
  PROFILE_LOAD_TIMEOUT_MS,
  withTimeout,
} from "@/lib/auth-timeout";

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

function utcPeriodKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function readPhotoMonthlyCount(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = localStorage.getItem(PHOTO_MONTHLY_COUNT_KEY);
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as { period?: string; count?: number };
    if (parsed.period !== utcPeriodKey()) return 0;
    return typeof parsed.count === "number" ? parsed.count : 0;
  } catch {
    return 0;
  }
}

function writePhotoMonthlyCount(count: number) {
  localStorage.setItem(
    PHOTO_MONTHLY_COUNT_KEY,
    JSON.stringify({ period: utcPeriodKey(), count }),
  );
}

export type SubscriptionFeatures = PlanEntitlements & {
  isPro: boolean;
  isHeavy: boolean;
  isFree: boolean;
  canUseVoice: boolean;
  voiceRemainingToday: number;
  /** Photo diagnose available (monthly vision cap; QA unlimited) */
  canUsePhotoDiagnose: boolean;
  /** Remaining photo analyses this UTC month; null = unlimited (QA) */
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
      } = await withTimeout(
        supabase.auth.getUser(),
        PROFILE_LOAD_TIMEOUT_MS,
        "Account check timed out.",
      );

      if (!user) {
        setProfile(null);
        return;
      }

      const { data: before } = await withTimeout(
        Promise.resolve(
          supabase
            .from("profiles")
            .select("*")
            .eq("id", user.id)
            .maybeSingle(),
        ),
        PROFILE_LOAD_TIMEOUT_MS,
        "Profile load timed out.",
      );

      if (before && shouldPersistTrialExpiry(before as Profile)) {
        markTrialExpiredPromptPending(
          (before as Profile).trial_ends_at,
        );
      }

      let next: Profile | null = null;
      try {
        const { data: synced, error: syncError } = await withTimeout(
          Promise.resolve(supabase.rpc("sync_my_trial_status")),
          PROFILE_LOAD_TIMEOUT_MS,
          "Profile sync timed out.",
        );
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
      } catch (syncErr) {
        console.warn("[useSubscription] sync timed out/failed", syncErr);
        next = (before as Profile | null) ?? null;
      }

      setProfile(next);

      if (!isQaUnlockEnabled() && consumeTrialExpiredPrompt()) {
        setShowTrialEndedPrompt(true);
      }
    } catch (err) {
      console.warn("[useSubscription] refresh failed", err);
      // Fail open — keep last profile / free defaults so Settings stays usable
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    setVoiceUsedToday(readVoiceDailyCount());
    setPhotoUsedToday(readPhotoMonthlyCount());

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      // Defer — awaiting auth APIs inside the callback can deadlock WKWebView.
      window.setTimeout(() => {
        void refresh();
      }, 0);
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

  const photoUnlimited = isQaUnlockEnabled();
  const visionCap = Math.max(
    0,
    base.visionCallsPerMonth || base.photoDailyLimit,
  );
  const photoRemainingToday = photoUnlimited
    ? null
    : Math.max(0, visionCap - photoUsedToday);
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
    if (isQaUnlockEnabled()) return true;
    const cap = Math.max(0, base.visionCallsPerMonth || base.photoDailyLimit);
    const next = readPhotoMonthlyCount() + 1;
    if (next > cap) {
      setPhotoUsedToday(cap);
      return false;
    }
    writePhotoMonthlyCount(next);
    setPhotoUsedToday(next);
    return true;
  }, [base.visionCallsPerMonth, base.photoDailyLimit]);

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
