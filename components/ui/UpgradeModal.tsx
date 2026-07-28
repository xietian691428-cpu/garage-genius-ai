"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Sparkles, X } from "lucide-react";
import { startCheckout } from "@/lib/billing";
import {
  getBillingMode,
  nativeUpgradeBlockedMessage,
} from "@/lib/native-platform";
import { PLAN_ENTITLEMENTS } from "@/lib/types/subscription";
import {
  upgradeCopy,
  yearlySavingsUsd,
  type UpgradeReason,
} from "@/lib/upgrade-copy";
import { TRIAL_DAYS } from "@/lib/subscription";

export type { UpgradeReason };

type UpgradeModalProps = {
  open: boolean;
  onClose: () => void;
  /** Contextual paywall reason — drives copy + pricing CTA */
  reason?: UpgradeReason;
  /** Optional overrides */
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
  const [busy, setBusy] = useState<"yearly" | "monthly" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const nativeIapRequired = getBillingMode() === "native_iap_required";

  if (!open) return null;

  const copy = upgradeCopy(reason);
  const heading = title ?? copy.title;
  const body = message ?? copy.message;
  const pro = PLAN_ENTITLEMENTS.pro;
  const saveYr = yearlySavingsUsd("pro");
  const pricingHref = `/pricing?from=${encodeURIComponent(reason)}`;

  const checkout = async (interval: "yearly" | "monthly") => {
    setError(null);
    if (nativeIapRequired) {
      setError(nativeUpgradeBlockedMessage());
      return;
    }
    setBusy(interval);
    try {
      await startCheckout({ plan: "pro", interval });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed");
      setBusy(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="upgrade-modal-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-3xl border border-slate-700 bg-[#111827] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative border-b border-slate-800 bg-gradient-to-br from-cyan-500/15 via-slate-900 to-slate-900 px-6 pb-5 pt-6">
          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 top-3 rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>

          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-500/20 text-cyan-300">
            <Sparkles className="h-5 w-5" />
          </div>

          <h2
            id="upgrade-modal-title"
            className="mt-4 pr-8 text-xl font-semibold text-white"
          >
            {heading}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">{body}</p>

          <div className="mt-4 inline-flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300">
            Save ${saveYr}/yr on annual · Cancel anytime
          </div>
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
            {nativeIapRequired ? (
              <p className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs leading-relaxed text-amber-100/90">
                {nativeUpgradeBlockedMessage()}
              </p>
            ) : (
              <>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void checkout("yearly")}
                  className="flex w-full flex-col items-center justify-center rounded-2xl bg-cyan-500 px-4 py-3 text-black hover:bg-cyan-400 disabled:opacity-60"
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
                  onClick={() => void checkout("monthly")}
                  className="flex w-full items-center justify-center rounded-2xl border border-slate-600 px-4 py-2.5 text-sm text-slate-200 hover:border-slate-400 disabled:opacity-60"
                >
                  {busy === "monthly"
                    ? "Opening checkout…"
                    : `Monthly — $${pro.priceMonthly}/mo`}
                </button>
              </>
            )}
            <Link
              href={pricingHref}
              className="text-center text-xs text-slate-500 underline-offset-2 hover:text-slate-300 hover:underline"
              onClick={onClose}
            >
              Compare all plans
            </Link>
          </div>

          <p className="mt-4 text-center text-[11px] leading-relaxed text-slate-500">
            {nativeIapRequired
              ? "Subscriptions on web use Stripe; native IAP coming later."
              : "Cancel anytime in billing portal."}
            {!nativeIapRequired && TRIAL_DAYS > 0
              ? ` Eligible accounts may include a ${TRIAL_DAYS}-day trial at checkout.`
              : ""}
          </p>

          <button
            type="button"
            onClick={onClose}
            className="mt-3 w-full py-2 text-sm text-slate-500 hover:text-slate-300"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
