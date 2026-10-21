"use client";

import { useState } from "react";
import { AlertTriangle, Loader2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useBodyScrollLock } from "@/lib/hooks/useBodyScrollLock";

type Props = {
  open: boolean;
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Risk gate before SAE Mode 04 clear. Clearing DTCs on your own vehicle for
 * DIY troubleshooting is generally lawful; clearing to pass an emissions
 * inspection while a fault remains can be illegal — we state that plainly.
 */
export default function ObdClearCodesModal({
  open,
  busy = false,
  error = null,
  onConfirm,
  onCancel,
}: Props) {
  const { t } = useTranslation();
  const [acked, setAcked] = useState(false);
  useBodyScrollLock(open);

  if (!open) return null;

  const close = () => {
    if (busy) return;
    setAcked(false);
    onCancel();
  };

  return (
    <div
      data-testid="obd-clear-codes-modal"
      className="fixed inset-0 z-[95] flex items-end justify-center overflow-y-auto bg-black/75 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="obd-clear-codes-title"
      onClick={close}
    >
      <div
        className="mb-[max(0.5rem,env(safe-area-inset-bottom))] w-full max-w-md rounded-3xl border border-amber-500/35 bg-[#111827] p-5 shadow-2xl sm:mb-0 sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-300">
              <AlertTriangle className="h-5 w-5" aria-hidden />
            </span>
            <div>
              <h2
                id="obd-clear-codes-title"
                className="text-lg font-semibold text-white sm:text-xl"
              >
                {t("obd.clearTitle")}
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                {t("obd.clearSubtitle")}
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label={t("common.close")}
            disabled={busy}
            onClick={close}
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-40"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <ul className="mt-4 space-y-2.5 text-sm leading-relaxed text-slate-300">
          <li className="rounded-2xl border border-slate-800 bg-slate-950/50 px-3 py-2.5">
            {t("obd.clearRiskRecord")}
          </li>
          <li className="rounded-2xl border border-slate-800 bg-slate-950/50 px-3 py-2.5">
            {t("obd.clearRiskNotFix")}
          </li>
          <li className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-amber-100">
            {t("obd.clearRiskSmog")}
          </li>
          <li className="rounded-2xl border border-slate-800 bg-slate-950/50 px-3 py-2.5">
            {t("obd.clearRiskPermanent")}
          </li>
          <li className="rounded-2xl border border-slate-800 bg-slate-950/50 px-3 py-2.5">
            {t("obd.clearRiskLegal")}
          </li>
        </ul>

        <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-700 bg-slate-950/40 px-3 py-3 text-sm text-slate-200">
          <input
            type="checkbox"
            data-testid="obd-clear-codes-ack"
            checked={acked}
            disabled={busy}
            onChange={(e) => setAcked(e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-slate-600"
          />
          <span>{t("obd.clearAck")}</span>
        </label>

        {error ? (
          <p
            role="alert"
            className="mt-3 rounded-xl border border-red-700/40 bg-red-950/30 px-3 py-2 text-sm text-red-100"
          >
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
          <button
            type="button"
            data-testid="obd-clear-codes-confirm"
            disabled={!acked || busy}
            onClick={() => {
              if (!acked || busy) return;
              onConfirm();
            }}
            className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-2xl bg-amber-500 px-4 text-base font-semibold text-black hover:bg-amber-400 disabled:opacity-50"
          >
            {busy ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                {t("obd.clearBusy")}
              </>
            ) : (
              t("obd.clearConfirm")
            )}
          </button>
          <button
            type="button"
            data-testid="obd-clear-codes-cancel"
            disabled={busy}
            onClick={close}
            className="inline-flex min-h-[48px] flex-1 items-center justify-center rounded-2xl border border-slate-600 px-4 text-base font-medium text-slate-200 hover:border-slate-500 disabled:opacity-50"
          >
            {t("common.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
