"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Mail } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

/**
 * Persistent banner when the signed-in user has not confirmed email yet.
 */
export default function VerifyEmailBanner() {
  const { t } = useTranslation();
  const {
    user,
    isEmailVerified,
    loading,
    resendVerificationEmail,
    refreshUser,
  } = useAuth();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (loading || !user || isEmailVerified) return null;

  const onResend = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await resendVerificationEmail();
      setMessage(t("auth.verifyResent"));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("auth.verifyResendFailed"),
      );
    } finally {
      setBusy(false);
    }
  };

  const onRefresh = async () => {
    setBusy(true);
    setError(null);
    try {
      await refreshUser();
      setMessage(t("auth.verifyRefreshed"));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.verifyRefreshFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="status"
      className="border-b border-amber-700/50 bg-amber-950/90 px-4 py-3 text-sm text-amber-50"
    >
      <div className="mx-auto flex max-w-4xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2">
          <Mail className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden />
          <div>
            <p className="font-medium text-amber-100">{t("auth.verifyTitle")}</p>
            <p className="mt-0.5 text-xs text-amber-100/80">
              {t("auth.verifyBody", { email: user.email ?? "" })}
            </p>
            {message && (
              <p className="mt-1 text-xs text-cyan-200">{message}</p>
            )}
            {error && <p className="mt-1 text-xs text-red-300">{error}</p>}
          </div>
        </div>
        <div className="flex shrink-0 gap-2 pl-6 sm:pl-0">
          <button
            type="button"
            disabled={busy}
            onClick={() => void onResend()}
            className="rounded-xl bg-amber-500/20 px-3 py-2 text-xs font-semibold text-amber-50 ring-1 ring-amber-500/40 hover:bg-amber-500/30 disabled:opacity-60"
          >
            {busy ? t("auth.verifyWorking") : t("auth.verifyResend")}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onRefresh()}
            className="rounded-xl border border-amber-500/30 px-3 py-2 text-xs font-medium text-amber-100 hover:border-amber-400/50 disabled:opacity-60"
          >
            {t("auth.verifyIConfirmed")}
          </button>
        </div>
      </div>
    </div>
  );
}
