"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Sparkles, X } from "lucide-react";
import { startCheckout } from "@/lib/billing";
import { toUserFacingBillingError } from "@/lib/billing-errors";
import {
  canUseNativeIap,
  canUseStripeCheckout,
  getBillingMode,
  NATIVE_NO_IAP_MESSAGE,
  NATIVE_WEBSITE_MANAGE_HINT,
} from "@/lib/native-platform";
import {
  openWebManageSubscriptionInSystemBrowser,
  purchaseApplePlan,
  restoreApplePurchases,
} from "@/lib/native-iap";
import { PLAN_ENTITLEMENTS } from "@/lib/types/subscription";
import {
  upgradeCopy,
  yearlySavingsUsd,
  type UpgradeReason,
} from "@/lib/upgrade-copy";
import { TRIAL_DAYS } from "@/lib/subscription";
import { useSubscription } from "@/hooks/useSubscription";

export type { UpgradeReason };

type UpgradeModalProps = {
  open: boolean;
  onClose: () => void;
  reason?: UpgradeReason;
  title?: string;
  message?: string;
};

export default function UpgradeModal({
  open,
  onClose,
  reason = "generic",
  title,
  message,
}: UpgradeModalProps) {
  const [busy, setBusy] = useState<
    "yearly" | "monthly" | "restore" | "heavy_m" | "heavy_y" | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const { refresh } = useSubscription();
  const mode = getBillingMode();
  const iap = canUseNativeIap();
  const stripe = canUseStripeCheckout();

  if (!open) return null;

  const copy = upgradeCopy(reason);
  const heading = title ?? (iap ? "Upgrade with Apple" : copy.title);
  const body =
    message ??
    (iap
      ? `${copy.message} Purchases use Apple In-App Purchase and sync to your Garage Genius account.`
      : copy.message);
  const pro = PLAN_ENTITLEMENTS.pro;
  const heavy = PLAN_ENTITLEMENTS.pro_heavy;
  const saveYr = yearlySavingsUsd("pro");
  const pricingHref = `/pricing?from=${encodeURIComponent(reason)}`;

  const run = async (fn: () => Promise<void>, key: typeof busy) => {
    setError(null);
    setBusy(key);
    try {
      await fn();
      await refresh?.();
      onClose();
    } catch (err) {
      setError(toUserFacingBillingError(err));
      setBusy(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="account-limits-modal-title"
      onClick={onClose}
    >
      <div
        className="max-h-[min(92dvh,100%)] w-full max-w-md overflow-y-auto rounded-t-3xl border border-slate-700 bg-[#111827] shadow-2xl sm:rounded-3xl pb-[max(0.5rem,env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative border-b border-slate-800 bg-gradient-to-br from-cyan-500/15 via-slate-900 to-slate-900 px-6 pb-5 pt-[max(1.5rem,env(safe-area-inset-top))] sm:pt-6">
          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 top-[max(0.75rem,env(safe-area-inset-top))] min-h-[44px] min-w-[44px] touch-manipulation rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white sm:top-3"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>

          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-500/20 text-cyan-300">
            <Sparkles className="h-5 w-5" />
          </div>

          <h2
            id="account-limits-modal-title"
            className="mt-4 pr-8 text-xl font-semibold text-white"
          >
            {heading}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">{body}</p>

          {(iap || stripe) && (
            <div className="mt-4 inline-flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300">
              Save ${saveYr}/yr on annual · Cancel anytime
            </div>
          )}
        </div>

        <div className="px-6 py-5">
          <ul className="space-y-2">
            {copy.bullets.map((b) => (
              <li
                key={b}
                className="flex items-start gap-2 text-sm text-slate-300"
              >
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" />
                <span>{b}</span>
              </li>
            ))}
          </ul>

          {error && (
            <p className="mt-3 text-sm text-rose-400" role="alert">
              {error}
            </p>
          )}

          <div className="mt-5 flex flex-col gap-2">
            {mode === "native_blocked" ? (
              <p className="rounded-2xl border border-slate-600 bg-slate-900/80 px-4 py-3 text-xs leading-relaxed text-slate-300">
                {NATIVE_NO_IAP_MESSAGE}
              </p>
            ) : iap ? (
              <>
                <button
                  type="button"
                  data-testid="iap-pro-yearly"
                  disabled={busy !== null}
                  onClick={() =>
                    void run(
                      () => purchaseApplePlan({ plan: "pro", interval: "yearly" }),
                      "yearly",
                    )
                  }
                  className="flex min-h-[48px] w-full touch-manipulation flex-col items-center justify-center rounded-2xl bg-cyan-500 px-4 py-3 text-black hover:bg-cyan-400 disabled:opacity-60"
                >
                  <span className="text-sm font-semibold">
                    {busy === "yearly"
                      ? "Purchasing…"
                      : `Subscribe Pro annual — $${pro.priceYearly}/yr`}
                  </span>
                  <span className="text-[11px] font-medium text-black/70">
                    Apple In-App Purchase · Best value
                  </span>
                </button>
                <button
                  type="button"
                  data-testid="iap-pro-monthly"
                  disabled={busy !== null}
                  onClick={() =>
                    void run(
                      () =>
                        purchaseApplePlan({ plan: "pro", interval: "monthly" }),
                      "monthly",
                    )
                  }
                  className="flex min-h-[44px] w-full touch-manipulation items-center justify-center rounded-2xl border border-slate-600 px-4 py-2.5 text-sm text-slate-200 hover:border-slate-400 disabled:opacity-60"
                >
                  {busy === "monthly"
                    ? "Purchasing…"
                    : `Subscribe Pro monthly — $${pro.priceMonthly}/mo`}
                </button>
                <button
                  type="button"
                  data-testid="iap-heavy-yearly"
                  disabled={busy !== null}
                  onClick={() =>
                    void run(
                      () =>
                        purchaseApplePlan({
                          plan: "pro_heavy",
                          interval: "yearly",
                        }),
                      "heavy_y",
                    )
                  }
                  className="flex min-h-[44px] w-full touch-manipulation items-center justify-center rounded-2xl border border-cyan-500/40 px-4 py-2.5 text-sm text-cyan-200 hover:bg-cyan-500/10 disabled:opacity-60"
                >
                  {busy === "heavy_y"
                    ? "Purchasing…"
                    : `Subscribe Heavy annual — $${heavy.priceYearly}/yr`}
                </button>
                <button
                  type="button"
                  data-testid="iap-restore"
                  disabled={busy !== null}
                  onClick={() =>
                    void run(async () => {
                      const { synced } = await restoreApplePurchases();
                      if (synced === 0) {
                        throw new Error(
                          "No active Apple subscriptions found for this Apple ID.",
                        );
                      }
                    }, "restore")
                  }
                  className="flex min-h-[44px] w-full touch-manipulation items-center justify-center rounded-2xl px-4 py-2.5 text-sm text-slate-400 hover:text-slate-200 disabled:opacity-60"
                >
                  {busy === "restore" ? "Restoring…" : "Restore purchases"}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void openWebManageSubscriptionInSystemBrowser()
                  }
                  className="text-center text-[11px] text-slate-500 underline-offset-2 hover:text-slate-300 hover:underline"
                >
                  {NATIVE_WEBSITE_MANAGE_HINT}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() =>
                    void run(
                      () => startCheckout({ plan: "pro", interval: "yearly" }),
                      "yearly",
                    )
                  }
                  className="flex min-h-[48px] w-full touch-manipulation flex-col items-center justify-center rounded-2xl bg-cyan-500 px-4 py-3 text-black hover:bg-cyan-400 disabled:opacity-60"
                >
                  <span className="text-sm font-semibold">
                    {busy === "yearly"
                      ? "Opening checkout…"
                      : `Go Pro annual — $${pro.priceYearly}/yr`}
                  </span>
                  <span className="text-[11px] font-medium text-black/70">
                    Best value · ~${(pro.priceYearly / 12).toFixed(2)}/mo
                  </span>
                </button>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() =>
                    void run(
                      () => startCheckout({ plan: "pro", interval: "monthly" }),
                      "monthly",
                    )
                  }
                  className="flex min-h-[44px] w-full touch-manipulation items-center justify-center rounded-2xl border border-slate-600 px-4 py-2.5 text-sm text-slate-200 hover:border-slate-400 disabled:opacity-60"
                >
                  {busy === "monthly"
                    ? "Opening checkout…"
                    : `Monthly — $${pro.priceMonthly}/mo`}
                </button>
                <Link
                  href={pricingHref}
                  className="text-center text-xs text-slate-500 underline-offset-2 hover:text-slate-300 hover:underline"
                  onClick={onClose}
                >
                  Compare all plans
                </Link>
              </>
            )}
          </div>

          {stripe && (
            <p className="mt-4 text-center text-[11px] leading-relaxed text-slate-500">
              Cancel anytime in billing portal.
              {TRIAL_DAYS > 0
                ? ` Eligible accounts may include a ${TRIAL_DAYS}-day trial at checkout.`
                : ""}
            </p>
          )}
          {iap && (
            <p className="mt-4 text-center text-[11px] leading-relaxed text-slate-500">
              Payment is charged to your Apple ID. Manage or cancel in Settings →
              Apple ID → Subscriptions. Prices shown are list prices; StoreKit
              shows the localized App Store price at purchase.
            </p>
          )}

          <button
            type="button"
            onClick={onClose}
            className="mt-3 min-h-[44px] w-full touch-manipulation py-2 text-sm text-slate-500 hover:text-slate-300"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
