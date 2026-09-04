"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
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
  percentLeft: number;
  unlimited: boolean;
  visionUsed: number;
  visionLimit: number;
  visionRemaining: number;
  aiSpendUsd: number;
  aiBudgetUsd: number;
  spendRemainingUsd: number;
  hardCapEnabled: boolean;
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
  percentLeft: 100,
  unlimited: false,
  visionUsed: 0,
  visionLimit: 3,
  visionRemaining: 3,
  aiSpendUsd: 0,
  aiBudgetUsd: 0.25,
  spendRemainingUsd: 0.25,
  hardCapEnabled: true,
};

type TokenUsageApi = {
  usage: TokenUsageView;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  isNearLimit: boolean;
  isExhausted: boolean;
};

const TokenUsageContext = createContext<TokenUsageApi | null>(null);

function useTokenUsageState(): TokenUsageApi {
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
      const data = (await res.json()) as TokenUsageView & {
        error?: string;
        testUnlimitedTokens?: boolean;
        qaUnlock?: boolean;
      };

      if (!res.ok) {
        throw new Error(data.error ?? "Failed to load token usage");
      }

      const unlimited = Boolean(
        data.unlimited || data.testUnlimitedTokens || data.qaUnlock,
      );
      const percentage = data.percentage ?? 0;
      const percentLeft =
        typeof data.percentLeft === "number"
          ? data.percentLeft
          : unlimited
            ? 100
            : Math.max(0, 100 - percentage);

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
        percentage,
        percentLeft,
        unlimited,
        visionUsed: data.visionUsed ?? 0,
        visionLimit: data.visionLimit ?? 3,
        visionRemaining:
          data.visionRemaining ?? data.visionLimit ?? 3,
        aiSpendUsd: data.aiSpendUsd ?? 0,
        aiBudgetUsd: data.aiBudgetUsd ?? 0.25,
        spendRemainingUsd: data.spendRemainingUsd ?? 0.25,
        hardCapEnabled: data.hardCapEnabled !== false,
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

  const isNearLimit = !usage.unlimited && usage.percentage >= 80;
  const isExhausted =
    !usage.unlimited && usage.signedIn && usage.remainingThisMonth <= 0;

  return useMemo(
    () => ({ usage, loading, error, refresh, isNearLimit, isExhausted }),
    [usage, loading, error, refresh, isNearLimit, isExhausted],
  );
}

export function TokenUsageProvider({ children }: { children: ReactNode }) {
  const value = useTokenUsageState();
  return <TokenUsageContext value={value}>{children}</TokenUsageContext>;
}

export function useTokenUsage(): TokenUsageApi {
  const ctx = useContext(TokenUsageContext);
  if (!ctx) {
    throw new Error("useTokenUsage must be used within TokenUsageProvider");
  }
  return ctx;
}
