"use client";

import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import TokenDisplay from "@/components/ui/token-display";
import { useSubscription } from "@/hooks/useSubscription";
import { openBillingPortal } from "@/lib/billing";
import {
  BILLING_PORTAL_UNAVAILABLE,
  toUserFacingBillingError,
} from "@/lib/billing-errors";
import { useState } from "react";
import { TrialStatusBanner } from "@/components/subscription/TrialBanners";
import LocaleSwitcher from "@/components/i18n/LocaleSwitcher";
import { useTranslation } from "react-i18next";
import SubscriptionAIAssistant from "@/components/subscription/SubscriptionAIAssistant";
import DiySkillSettings from "@/components/settings/DiySkillSettings";
import InsuranceProfileSettings from "@/components/settings/InsuranceProfileSettings";
import ObdToolsSettings from "@/components/settings/ObdToolsSettings";
import ShareAppCard from "@/components/settings/ShareAppCard";
import LiabilityDisclaimer from "@/components/legal/LiabilityDisclaimer";
import { supabase } from "@/lib/supabase";
import type { VehicleInfo } from "@/lib/types/chat";

type Props = {
  currentVehicle?: VehicleInfo | null;
  vehiclesLoading?: boolean;
  onUpdateVehicle?: (vehicle: VehicleInfo) => Promise<VehicleInfo | void>;
};

export default function SettingsPanel({
  currentVehicle = null,
  vehiclesLoading = false,
  onUpdateVehicle,
}: Props) {
  const { t } = useTranslation();
  const { user, signOut, isEmailVerified, resendVerificationEmail, refreshUser } =
    useAuth();
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
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);

  const handleManageBilling = async () => {
    setBusy(true);
    setError(null);
    try {
      await openBillingPortal();
    } catch (err) {
      setError(toUserFacingBillingError(err, BILLING_PORTAL_UNAVAILABLE));
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

  const handleDeleteAccount = async () => {
    if (deleteConfirm !== "DELETE") {
      setError('Type DELETE in capitals to confirm account deletion.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Not signed in");

      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ confirm: "DELETE" }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(json.error || "Could not delete account");
      }
      await signOut();
      window.location.href = "/?deleted=1";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
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
          {!isEmailVerified && (
            <div className="mt-4 rounded-2xl border border-amber-700/40 bg-amber-950/30 px-3 py-3 text-sm text-amber-100">
              <p className="font-medium">{t("auth.verifyTitle")}</p>
              <p className="mt-1 text-xs text-amber-100/80">
                {t("auth.verifyBody", { email: user?.email ?? "" })}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    void (async () => {
                      setBusy(true);
                      setError(null);
                      try {
                        await resendVerificationEmail();
                      } catch (err) {
                        setError(
                          err instanceof Error
                            ? err.message
                            : t("auth.verifyResendFailed"),
                        );
                      } finally {
                        setBusy(false);
                      }
                    })();
                  }}
                  className="rounded-xl bg-amber-500/20 px-3 py-2 text-xs font-semibold text-amber-50 ring-1 ring-amber-500/40"
                >
                  {t("auth.verifyResend")}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    void (async () => {
                      setBusy(true);
                      try {
                        await refreshUser();
                      } finally {
                        setBusy(false);
                      }
                    })();
                  }}
                  className="rounded-xl border border-amber-500/30 px-3 py-2 text-xs text-amber-100"
                >
                  {t("auth.verifyIConfirmed")}
                </button>
              </div>
            </div>
          )}
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

        <ObdToolsSettings />

        {onUpdateVehicle ? (
          <InsuranceProfileSettings
            vehicle={currentVehicle}
            loading={vehiclesLoading}
            onSave={onUpdateVehicle}
          />
        ) : null}

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

        <ShareAppCard />

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

        <section className="rounded-3xl border border-red-900/50 bg-red-950/20 p-5">
          <h2 className="text-xs font-medium uppercase tracking-wide text-red-300/80">
            Delete account
          </h2>
          <p className="mt-2 text-sm text-slate-400">
            Permanently deletes your Garage Genius account, vehicles, chats,
            maintenance history, and inventory we store for you. This cannot be
            undone. Active Stripe subscriptions are cancelled when possible —
            also confirm in Manage billing if a charge continues.
          </p>
          {!deleteOpen ? (
            <button
              type="button"
              disabled={busy || !isEmailVerified}
              onClick={() => {
                setDeleteOpen(true);
                setError(null);
              }}
              className="mt-4 w-full rounded-2xl border border-red-500/40 px-4 py-3 text-sm font-medium text-red-200 hover:border-red-400 disabled:opacity-60"
            >
              {!isEmailVerified
                ? t("auth.verifyBeforeDelete")
                : "Delete my account…"}
            </button>
          ) : (
            <div className="mt-4 space-y-3">
              <label className="block space-y-1.5">
                <span className="text-xs text-slate-500">
                  Type <span className="font-mono text-red-200">DELETE</span> to
                  confirm
                </span>
                <input
                  value={deleteConfirm}
                  onChange={(e) => setDeleteConfirm(e.target.value)}
                  autoComplete="off"
                  className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-red-400"
                  placeholder="DELETE"
                />
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setDeleteOpen(false);
                    setDeleteConfirm("");
                  }}
                  className="flex-1 rounded-2xl border border-slate-700 px-4 py-3 text-sm text-slate-300 disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={busy || deleteConfirm !== "DELETE"}
                  onClick={() => void handleDeleteAccount()}
                  className="flex-1 rounded-2xl bg-red-600 px-4 py-3 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-60"
                >
                  {busy ? "Deleting…" : "Delete forever"}
                </button>
              </div>
            </div>
          )}
        </section>

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
