"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";
import { startTokenRecharge } from "@/lib/billing";
import {
  BILLING_RECHARGE_UNAVAILABLE,
  toUserFacingBillingError,
} from "@/lib/billing-errors";
import { TOKEN_RECHARGE_PACKS } from "@/lib/types/tokens";
import TokenDisplay from "@/components/ui/token-display";
import { TokenUsageProvider } from "@/hooks/useTokenUsage";
import {
  canUseNativeIap,
  canUsePlayBilling,
  hideWebCheckoutUi,
  NATIVE_NO_IAP_MESSAGE,
} from "@/lib/native-platform";

export default function RechargePageClient({
  forceStoreSafe = false,
}: {
  forceStoreSafe?: boolean;
}) {
  const { t } = useTranslation();
  const storeSafe = forceStoreSafe || hideWebCheckoutUi();
  const iap = canUseNativeIap();
  const play = canUsePlayBilling();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("status");
    if (status === "success") {
      setStatusMessage(
        "Payment received. Bonus tokens will appear shortly after Stripe confirms.",
      );
    } else if (status === "canceled") {
      setStatusMessage("Checkout canceled. No charge was made.");
    }
  }, []);

  const handleRecharge = async (tokens: number, price: number) => {
    setLoading(String(tokens));
    setError(null);
    try {
      await startTokenRecharge(tokens, price);
    } catch (err) {
      setError(toUserFacingBillingError(err, BILLING_RECHARGE_UNAVAILABLE));
      setLoading(null);
    }
  };

  return (
    <TokenUsageProvider>
    <div className="page-scroll min-h-dvh bg-[#0a0f1c] text-slate-200">
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-8">
        <Link
          href="/app"
          className="mb-8 inline-flex items-center gap-2 text-sm text-slate-400 transition hover:text-cyan-300"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to app
        </Link>

        <h1 className="text-3xl font-bold text-white sm:text-4xl">
          {iap
            ? "Subscribe with Apple"
            : play
              ? t("billing.playPricingTitle")
              : storeSafe
                ? "AI quota"
                : "Add AI top-up"}
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          {iap
            ? "AI top-ups are not sold in the iOS app. Upgrade to Pro or Multi-Car with Apple In-App Purchase."
            : play
              ? t("billing.playPricingBody")
              : storeSafe
                ? NATIVE_NO_IAP_MESSAGE
                : "Out of AI chat for the month? Add a one-time top-up — it stacks on your plan and is used after your monthly allowance."}
        </p>

        <div className="mt-6">
          <TokenDisplay />
        </div>

        {statusMessage && (
          <p className="mt-4 rounded-2xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-200">
            {statusMessage}
          </p>
        )}
        {error && (
          <p className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </p>
        )}

        {(iap || play) && (
          <Link
            href="/pricing"
            className="mt-6 block rounded-2xl bg-cyan-500 px-4 py-3 text-center text-sm font-semibold text-black hover:bg-cyan-400"
          >
            {play ? t("billing.playSubscribe") : "View Apple subscriptions"}
          </Link>
        )}

        {!storeSafe && (
        <div className="mt-8 grid gap-4">
          {TOKEN_RECHARGE_PACKS.map((option) => {
            const isLoading = loading === String(option.tokens);
            return (
              <div
                key={option.id}
                className="rounded-3xl border border-slate-700 bg-[#111827] p-6 transition-colors hover:border-cyan-400/60 sm:p-8"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-2xl font-bold text-white">
                      {option.label}
                    </h3>
                    <p className="mt-1 text-sm text-slate-400">
                      {option.description}
                    </p>
                  </div>
                  <div className="sm:text-right">
                    <p className="text-4xl font-bold text-white">
                      ${option.priceUsd}
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        void handleRecharge(option.tokens, option.priceUsd)
                      }
                      disabled={loading !== null}
                      className="mt-4 w-full rounded-2xl bg-cyan-500 px-8 py-3 font-medium text-black transition hover:bg-cyan-400 disabled:opacity-60 sm:w-auto"
                    >
                      {isLoading ? "Processing…" : "Buy Now"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        )}

        <p className="mt-8 text-center text-xs text-slate-500">
          {iap
            ? "Manage or cancel in Settings → Apple ID → Subscriptions."
            : play
              ? t("billing.playLegal")
              : storeSafe
                ? NATIVE_NO_IAP_MESSAGE
                : (
              <>
          Payments are processed by Stripe. Tokens are credited after{" "}
          <code className="text-slate-400">checkout.session.completed</code>.
              </>
            )}
        </p>
      </div>
    </div>
    </TokenUsageProvider>
  );
}
