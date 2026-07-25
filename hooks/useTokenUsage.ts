"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { TokenPlan } from "@/lib/types/tokens";

export type TokenUsageView = {
  signedIn: boolean;
  plan: TokenPlan;
  used: number;
  limit: number;
  includedMonthly: number;
  monthlyHardCap: number | null;
  includedRemaining: number;
  bonusRemaining: number;
  remainingThisMonth: number;
  percentage: number;
};

const DEFAULT_VIEW: TokenUsageView = {
  signedIn: false,
  plan: "free",
  used: 0,
  limit: 15_000,
  includedMonthly: 15_000,
  monthlyHardCap: null,
  includedRemaining: 15_000,
  bonusRemaining: 0,
  remainingThisMonth: 15_000,
  percentage: 0,
};

export function useTokenUsage() {
  const [usage, setUsage] = useState<TokenUsageView>(DEFAULT_VIEW);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const headers: HeadersInit = {};
      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`;
      }

      const res = await fetch("/api/tokens/usage", { headers });
      const data = (await res.json()) as TokenUsageView & { error?: string };

      if (!res.ok) {
        throw new Error(data.error ?? "Failed to load token usage");
      }

      setUsage({
        signedIn: Boolean(data.signedIn),
        plan: data.plan ?? "free",
        used: data.used ?? 0,
        limit: data.limit ?? data.includedMonthly ?? 15_000,
        includedMonthly: data.includedMonthly ?? 15_000,
        monthlyHardCap: data.monthlyHardCap ?? null,
        includedRemaining: data.includedRemaining ?? 0,
        bonusRemaining: data.bonusRemaining ?? 0,
        remainingThisMonth: data.remainingThisMonth ?? 0,
        percentage: data.percentage ?? 0,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tokens");
      setUsage(DEFAULT_VIEW);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void refresh();
    });

    return () => subscription.unsubscribe();
  }, [refresh]);

  const isNearLimit = usage.percentage >= 80;
  const isExhausted = usage.remainingThisMonth <= 0;

  return { usage, loading, error, refresh, isNearLimit, isExhausted };
}
