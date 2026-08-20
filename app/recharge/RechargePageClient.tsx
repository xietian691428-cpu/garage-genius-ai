"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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
  hideWebCheckoutUi,
  NATIVE_NO_IAP_MESSAGE,
} from "@/lib/native-platform";

export default function RechargePageClient({
  forceStoreSafe = false,
}: {
  forceStoreSafe?: boolean;
}) {
  const storeSafe = forceStoreSafe || hideWebCheckoutUi();
  const iap = canUseNativeIap();
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
    <div className="min-h-dvh bg-[#0a0f1c] text-slate-200">
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-8">
        <Link
          href="/app"
          className="mb-8 inline-flex items-center gap-2 text-sm text-slate-400 transition hover:text-cyan-300"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to app
        </Link>

        <h1 className="text-3xl font-bold text-white sm:text-4xl">
          {iap ? "Subscribe with Apple" : storeSafe ? "AI quota" : "Buy More Tokens"}
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          {iap
            ? "Token packs are not sold in the iOS app. Upgrade to Pro or Pro Heavy with Apple In-App Purchase."
            : storeSafe
              ? NATIVE_NO_IAP_MESSAGE
              : "Top up when your monthly included quota runs out. Pricing follows PROJECT.md (~$0.06–$0.08 per 1k with volume packs)."}
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

        {iap && (
          <Link
            href="/pricing"
            className="mt-6 block rounded-2xl bg-cyan-500 px-4 py-3 text-center text-sm font-semibold text-black hover:bg-cyan-400"
          >
            View Apple subscriptions
          </Link>
        )}

        {!storeSafe && (
        <div className="mt-8 grid gap-4">
          {TOKEN_RECHARGE_PACKS.map((option) => {
            const per1k = (option.priceUsd / (option.tokens / 1000)).toFixed(3);
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
                    <p className="mt-2 text-xs text-slate-500">
                      ≈ ${per1k} / 1k tokens
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
