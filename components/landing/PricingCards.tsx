"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Check } from "lucide-react";
import {
  PLAN_ENTITLEMENTS,
  type BillingInterval,
  type PaidPlan,
  type SubscriptionTier,
} from "@/lib/types/subscription";
import { startCheckout, openBillingPortal } from "@/lib/billing";
import {
  BILLING_PORTAL_UNAVAILABLE,
  toUserFacingBillingError,
} from "@/lib/billing-errors";
import {
  hideStorePurchaseUi,
  NATIVE_NO_IAP_MESSAGE,
  NATIVE_WEBSITE_MANAGE_HINT,
} from "@/lib/native-platform";
import { useSubscription } from "@/hooks/useSubscription";
import { useAuth } from "@/hooks/useAuth";
import { TrialStatusBanner } from "@/components/subscription/TrialBanners";
import { TRIAL_DAYS } from "@/lib/subscription";
import { upgradeCopy, type UpgradeReason } from "@/lib/upgrade-copy";

const TIERS: SubscriptionTier[] = ["free", "pro", "pro_heavy"];

function formatPrice(amount: number): string {
  if (amount === 0) return "$0";
  return `$${amount % 1 === 0 ? amount.toFixed(0) : amount.toFixed(2)}`;
}

const FROM_REASONS = new Set<UpgradeReason>([
  "playbook",
  "annual",
  "history",
  "tags",
  "voice",
  "photo",
  "tokens",
  "vehicles",
  "shop_report",
  "generic",
]);

export type PricingCardsProps = {
  /** Where Free / trial CTAs send signed-out users */
  trialHref?: string;
  /** Where Free CTA sends signed-in users */
  appHref?: string;
  className?: string;
  footnote?: boolean;
  forceStoreSafe?: boolean;
};

export default function PricingCards({
  trialHref = "/login?next=/app",
  appHref = "/app",
  className = "",
  footnote = true,
  forceStoreSafe = false,
}: PricingCardsProps) {
  const searchParams = useSearchParams();
  const fromRaw = searchParams.get("from") || "";
  const fromReason: UpgradeReason | null = FROM_REASONS.has(
    fromRaw as UpgradeReason,
  )
    ? (fromRaw as UpgradeReason)
    : null;
  const contextCopy = fromReason ? upgradeCopy(fromReason) : null;

  const { user, loading: authLoading } = useAuth();
  const {
    tier,
    isPro,
    isHeavy,
    isTrialing,
    resolved,
    loading: subLoading,
  } = useSubscription();
  // Contextual upgrade paths default to yearly (best value)
  const [interval, setInterval] = useState<BillingInterval>(
    fromReason ? "yearly" : "monthly",
  );
  const [busyPlan, setBusyPlan] = useState<PaidPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const storeSafe = forceStoreSafe || hideStorePurchaseUi();

  const yearlySavings = useMemo(() => {
    const pro = PLAN_ENTITLEMENTS.pro;
    const heavy = PLAN_ENTITLEMENTS.pro_heavy;
    return {
      pro: Math.round(pro.priceMonthly * 12 - pro.priceYearly),
      heavy: Math.round(heavy.priceMonthly * 12 - heavy.priceYearly),
    };
  }, []);

  const handleSelect = async (planTier: SubscriptionTier) => {
    setError(null);

    if (planTier === "free") {
      window.location.href = user ? appHref : trialHref;
      return;
    }

    if (!user) {
      window.location.href = `/login?next=${encodeURIComponent("/pricing")}`;
      return;
    }

    if (storeSafe) {
      return;
    }

    if (
      (planTier === "pro" && isPro && !isHeavy && !isTrialing) ||
      (planTier === "pro_heavy" && isHeavy)
    ) {
      try {
        setBusyPlan(planTier);
        await openBillingPortal();
      } catch (err) {
        setError(toUserFacingBillingError(err, BILLING_PORTAL_UNAVAILABLE));
        setBusyPlan(null);
      }
      return;
    }

    try {
      setBusyPlan(planTier);
      await startCheckout({ plan: planTier, interval });
    } catch (err) {
      setError(toUserFacingBillingError(err));
      setBusyPlan(null);
    }
  };

  const ctaLabel = (planTier: SubscriptionTier): string => {
    if (busyPlan === planTier) return "Opening…";
    if (planTier === "free") {
      if (tier === "free" && user) return "Open garage";
      return user ? "Continue free" : "Start free";
    }
    if (planTier === "pro" && isTrialing) return "Keep Pro after trial";
    if (planTier === "pro" && isPro && !isHeavy) return "Manage billing";
    if (planTier === "pro_heavy" && isHeavy) return "Manage billing";
    if (planTier === "pro" && isHeavy) return "Switch in portal";
    if (!user) return "Sign in to upgrade";
    return planTier === "pro_heavy" ? "Upgrade to Heavy" : "Start Pro";
  };

  if (storeSafe) {
    return (
      <div className={className}>
        <div className="rounded-3xl border border-slate-700 bg-[#111827] px-5 py-6">
          <p className="text-sm font-semibold text-white">Account plans</p>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            {NATIVE_NO_IAP_MESSAGE}
          </p>
          <p className="mt-3 text-xs leading-relaxed text-slate-500">
            {NATIVE_WEBSITE_MANAGE_HINT}
          </p>
          <Link
            href={appHref}
            className="mt-5 inline-flex rounded-2xl bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-black hover:bg-cyan-400"
          >
            {user ? "Open garage" : "Sign in"}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <TrialStatusBanner resolved={resolved} loading={subLoading} className="mb-6" />

      {contextCopy && (
        <div className="mb-6 rounded-2xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3">
          <p className="text-sm font-semibold text-cyan-200">{contextCopy.title}</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">
            {contextCopy.message}
          </p>
          <p className="mt-2 text-[11px] text-emerald-300/90">
            Annual Pro saves ~${yearlySavings.pro}/yr · Cancel anytime
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-2xl border border-slate-700 bg-slate-900/80 p-1">
          <button
            type="button"
            onClick={() => setInterval("monthly")}
            className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
              interval === "monthly"
                ? "bg-cyan-500 text-black"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setInterval("yearly")}
            className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
              interval === "yearly"
                ? "bg-cyan-500 text-black"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Yearly
          </button>
        </div>
        {interval === "yearly" && (
          <span className="text-xs text-emerald-400">
            Save ~${yearlySavings.pro} on Pro / ~${yearlySavings.heavy} on Heavy
            vs monthly
          </span>
        )}
      </div>

      {error && (
        <p className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </p>
      )}

      <div className="mt-8 grid gap-5 lg:grid-cols-3">
        {TIERS.map((planTier) => {
          const plan = PLAN_ENTITLEMENTS[planTier];
          const isCurrent =
            !subLoading &&
            Boolean(user) &&
            ((planTier === "free" && tier === "free") ||
              (planTier === "pro" && tier === "pro") ||
              (planTier === "pro_heavy" && tier === "pro_heavy"));
          const price =
            planTier === "free"
              ? 0
              : interval === "yearly"
                ? plan.priceYearly
                : plan.priceMonthly;
          const period =
            planTier === "free"
              ? ""
              : interval === "yearly"
                ? "/year"
                : "/mo";
          const highlighted = planTier === "pro";

          return (
            <article
              key={planTier}
              className={`relative flex flex-col rounded-3xl border p-6 sm:p-7 ${
                highlighted
                  ? "border-cyan-500/50 bg-gradient-to-b from-cyan-500/10 to-[#111827]"
                  : "border-slate-800 bg-[#111827]"
              }`}
            >
              {plan.highlight && (
                <span className="absolute -top-3 left-6 rounded-full bg-cyan-500 px-3 py-0.5 text-[11px] font-semibold text-black">
                  {plan.highlight}
                </span>
              )}

              <h3 className="font-[family-name:var(--font-display)] text-xl font-semibold text-white">
                {plan.label}
              </h3>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-4xl font-bold text-white">
                  {formatPrice(price)}
                </span>
                {period && (
                  <span className="text-sm text-slate-500">{period}</span>
                )}
              </div>
              <p className="mt-2 text-sm text-slate-400">
                {(plan.includedTokens / 1000).toFixed(0)}k tokens / month
                {plan.monthlyHardCap
                  ? ` · hard cap ${(plan.monthlyHardCap / 1000).toFixed(0)}k`
                  : ""}
              </p>

              <ul className="mt-6 flex-1 space-y-3">
                {plan.features.map((feature) => (
                  <li
                    key={feature}
                    className="flex gap-2 text-sm text-slate-300"
                  >
                    <Check
                      className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400"
                      aria-hidden
                    />
                    {feature}
                  </li>
                ))}
              </ul>

              <button
                type="button"
                disabled={
                  authLoading ||
                  busyPlan !== null ||
                  (planTier === "free" && isCurrent && Boolean(user))
                }
                onClick={() => void handleSelect(planTier)}
                className={`mt-8 w-full rounded-2xl px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                  highlighted
                    ? "bg-cyan-500 text-black hover:bg-cyan-400"
                    : "border border-slate-600 bg-slate-900 text-white hover:border-cyan-500/40"
                }`}
              >
                {isCurrent && planTier === "free"
                  ? "Current plan"
                  : ctaLabel(planTier)}
              </button>
            </article>
          );
        })}
      </div>

      {footnote && (
        <p className="mt-10 text-center text-xs text-slate-500">
          New accounts get a {TRIAL_DAYS}-day Pro trial automatically — no card
          required to start. Upgrade anytime to keep Pro after the trial.
          Cancel paid plans anytime. Token top-ups on{" "}
          <Link href="/recharge" className="text-cyan-400 hover:underline">
            /recharge
          </Link>
          .
        </p>
      )}
    </div>
  );
}
