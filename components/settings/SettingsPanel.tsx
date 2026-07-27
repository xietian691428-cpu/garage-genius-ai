"use client";

import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import TokenDisplay from "@/components/ui/token-display";
import { useSubscription } from "@/hooks/useSubscription";
import { openBillingPortal } from "@/lib/billing";
import { useState } from "react";
import { TrialStatusBanner } from "@/components/subscription/TrialBanners";
import LocaleSwitcher from "@/components/i18n/LocaleSwitcher";
import { useTranslation } from "react-i18next";
import SubscriptionAIAssistant from "@/components/subscription/SubscriptionAIAssistant";
import DiySkillSettings from "@/components/settings/DiySkillSettings";
import LiabilityDisclaimer from "@/components/legal/LiabilityDisclaimer";

export default function SettingsPanel() {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const {
    isPro,
    isTrialing,
    tier,
    status,
    resolved,
    loading: subLoading,
  } = useSubscription();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showBillingHelp, setShowBillingHelp] = useState(false);

  const handleManageBilling = async () => {
    setBusy(true);
    setError(null);
    try {
      await openBillingPortal();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Portal failed");
      setBusy(false);
    }
  };

  const handleSignOut = async () => {
    setBusy(true);
    try {
      await signOut();
      window.location.href = "/login";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign out failed");
      setBusy(false);
    }
  };

  const planLabel = subLoading
    ? "…"
    : resolved.label + (status && !isTrialing ? ` (${status})` : "");

  if (showBillingHelp) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <SubscriptionAIAssistant onClose={() => setShowBillingHelp(false)} />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:p-8">
      <div className="mx-auto max-w-lg space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Account</h1>
          <p className="mt-1 text-sm text-slate-400">
            Manage sign-in, plan, and tokens. Optimized for iOS & Android store
            apps.
          </p>
        </div>

        <section className="rounded-3xl border border-slate-800 bg-[#111827] p-5">
          <h2 className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Signed in as
          </h2>
          <p className="mt-2 break-all text-lg font-medium text-white">
            {user?.email ?? "—"}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            User ID: {user?.id?.slice(0, 8)}…
          </p>
        </section>

        <TrialStatusBanner
          resolved={resolved}
          loading={subLoading}
        />

        <section className="rounded-3xl border border-slate-800 bg-[#111827] p-5">
          <h2 className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {t("settings.languageTitle")}
          </h2>
          <p className="mt-2 text-sm text-slate-400">{t("settings.languageHint")}</p>
          <div className="mt-4">
            <LocaleSwitcher />
          </div>
        </section>

        <DiySkillSettings />

        <section className="rounded-3xl border border-slate-800 bg-[#111827] p-5">
          <h2 className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Subscription
          </h2>
          <p className="mt-2 text-lg font-medium text-white">{planLabel}</p>
          <p className="mt-1 text-sm text-slate-400">
            {isTrialing
              ? "Enjoy full Pro features during your trial. Subscribe before it ends to keep voice coaching and higher limits."
              : "Free includes limited monthly tokens. Pro unlocks voice coaching, more vehicles, and higher RAG depth. Heavy adds deep RAG and higher caps."}
          </p>
          {!isPro || isTrialing ? (
            <Link
              href="/pricing"
              className="mt-4 block w-full rounded-2xl bg-cyan-500 px-4 py-3 text-center text-sm font-semibold text-black hover:bg-cyan-400"
            >
              {isTrialing ? "Keep Pro after trial" : "View plans & upgrade"}
            </Link>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleManageBilling()}
              className="mt-4 w-full rounded-2xl border border-slate-600 px-4 py-3 text-sm font-medium text-slate-200 hover:border-cyan-500/40 disabled:opacity-60"
            >
              {busy ? "Opening…" : "Manage billing"}
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowBillingHelp(true)}
            className="mt-2 w-full rounded-2xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-sm font-medium text-cyan-200 hover:border-cyan-400/50"
          >
            Billing help coach
          </button>
          {tier === "pro" && !isTrialing && (
            <Link
              href="/pricing"
              className="mt-2 block text-center text-xs text-cyan-400 hover:underline"
            >
              Compare Pro Heavy
            </Link>
          )}
        </section>

        <TokenDisplay />

        <Link
          href="/recharge"
          className="block rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-center text-sm font-medium text-cyan-300 transition hover:border-cyan-500/50"
        >
          Buy more tokens
        </Link>

        {error && (
          <p className="rounded-2xl bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </p>
        )}

        <button
          type="button"
          disabled={busy}
          onClick={() => void handleSignOut()}
          className="w-full rounded-2xl border border-slate-700 px-4 py-3 text-sm text-slate-300 transition hover:border-red-400/40 hover:text-red-300 disabled:opacity-60"
        >
          Sign out
        </button>

        <LiabilityDisclaimer variant="panel" className="mt-2" />

        <p className="pb-2 text-center text-xs text-slate-500">
          <Link href="/privacy" className="hover:text-cyan-400 hover:underline">
            Privacy Policy
          </Link>
          <span className="mx-2 opacity-40" aria-hidden>
            ·
          </span>
          <Link href="/terms" className="hover:text-cyan-400 hover:underline">
            Terms of Service
          </Link>
        </p>
      </div>
    </div>
  );
}
