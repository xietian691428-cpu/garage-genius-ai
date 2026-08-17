"use client";

import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import PricingCards from "@/components/landing/PricingCards";
import { useSubscription } from "@/hooks/useSubscription";
import { TrialEndedModal } from "@/components/subscription/TrialBanners";
import { TRIAL_DAYS } from "@/lib/subscription";
import {
  canUseNativeIap,
  getBillingMode,
  isStoreShellClient,
  NATIVE_NO_IAP_MESSAGE,
  NATIVE_WEBSITE_MANAGE_HINT,
} from "@/lib/native-platform";

export default function PricingPageClient({
  forceStoreSafe = false,
}: {
  forceStoreSafe?: boolean;
}) {
  const storeShell = forceStoreSafe || isStoreShellClient();
  const iap = canUseNativeIap();
  const blocked = getBillingMode() === "native_blocked";
  const {
    isTrialing,
    trialCountdown,
    showTrialEndedPrompt,
    dismissTrialEndedPrompt,
  } = useSubscription();

  return (
    <div className="landing-root">
      <TrialEndedModal
        open={showTrialEndedPrompt}
        onClose={dismissTrialEndedPrompt}
      />

      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(34,211,238,0.18), transparent), radial-gradient(ellipse 60% 40% at 100% 0%, rgba(16,185,129,0.08), transparent)",
        }}
      />

      <div className="relative mx-auto max-w-6xl px-4 py-10 sm:px-8 sm:py-14">
        <Link
          href="/app"
          className="mb-8 inline-flex items-center gap-2 text-sm text-slate-400 transition hover:text-cyan-300"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to app
        </Link>

        <header className="max-w-2xl">
          <p className="text-sm font-medium tracking-wide text-cyan-400/90 font-[family-name:var(--font-display)]">
            Garage Genius AI
          </p>
          <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight text-white sm:text-5xl">
            {iap || storeShell
              ? "Subscribe with Apple"
              : "Simple plans for DIY repair"}
          </h1>
          <p className="mt-3 text-base text-slate-400 sm:text-lg">
            {blocked
              ? NATIVE_NO_IAP_MESSAGE
              : iap || storeShell
                ? "Pro and Pro Heavy are auto-renewable Apple In-App Purchases. Restore purchases anytime. Optional plan details also open on our website in the system browser."
                : `Every new account gets a ${TRIAL_DAYS}-day Pro Trial. Free covers basics; Pro unlocks voice, custom tags, annual reports, and higher limits. Cancel anytime.`}
          </p>
          {(iap || storeShell) && !blocked && (
            <p className="mt-3 text-sm text-slate-500">
              {NATIVE_WEBSITE_MANAGE_HINT}
            </p>
          )}
          {!storeShell && isTrialing && trialCountdown && (
            <p className="mt-4 text-sm font-medium text-cyan-300">
              {trialCountdown}
            </p>
          )}
        </header>

        <Suspense
          fallback={
            <div className="mt-10 h-64 animate-pulse rounded-3xl bg-slate-900/60" />
          }
        >
          <PricingCards className="mt-10" forceStoreSafe={forceStoreSafe} />
        </Suspense>

        <p className="mt-12 text-center text-xs text-slate-500">
          <Link href="/privacy" className="hover:text-cyan-400 hover:underline">
            Privacy
          </Link>
          <span className="mx-2 opacity-40" aria-hidden>
            ·
          </span>
          <Link href="/terms" className="hover:text-cyan-400 hover:underline">
            Terms
          </Link>
        </p>
      </div>
    </div>
  );
}
