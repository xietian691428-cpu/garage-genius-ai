"use client";

import { useState } from "react";
import { INSURANCE_SAFETY_COPY } from "@/lib/insurance-safety-copy";

type Props = {
  open: boolean;
  onContinue: () => void;
  onCancel: () => void;
};

/**
 * One-time high-tier understanding gate (account-level).
 * Educational confirmation — does not block reading after acknowledge.
 */
export default function SafetyAdviceAckModal({
  open,
  onContinue,
  onCancel,
}: Props) {
  const [checked, setChecked] = useState(false);

  if (!open) return null;

  return (
    <div
      data-testid="safety-advice-ack-modal"
      className="fixed inset-0 z-[92] flex items-end justify-center overflow-y-auto bg-black/70 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="safety-advice-ack-title"
    >
      <div
        className="mb-[max(0.5rem,env(safe-area-inset-bottom))] w-full max-w-md rounded-3xl border border-slate-700 bg-[#111827] p-5 shadow-2xl sm:mb-0 sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="safety-advice-ack-title"
          className="text-lg font-semibold text-white"
        >
          Before you continue
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-300">
          {INSURANCE_SAFETY_COPY.safetyCriticalMayAffect}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          {INSURANCE_SAFETY_COPY.safetyCriticalGuideOnly}
        </p>

        <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-700 bg-slate-950/40 px-3 py-3 text-sm text-slate-200">
          <input
            type="checkbox"
            data-testid="safety-advice-ack-check"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-slate-600"
          />
          <span>{INSURANCE_SAFETY_COPY.highAckCheckbox}</span>
        </label>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            data-testid="safety-advice-ack-continue"
            disabled={!checked}
            onClick={() => {
              if (!checked) return;
              setChecked(false);
              onContinue();
            }}
            className="inline-flex min-h-[48px] flex-1 items-center justify-center rounded-2xl bg-cyan-500 px-4 text-sm font-semibold text-black hover:bg-cyan-400 disabled:opacity-50"
          >
            {INSURANCE_SAFETY_COPY.highAckContinue}
          </button>
          <button
            type="button"
            data-testid="safety-advice-ack-cancel"
            onClick={() => {
              setChecked(false);
              onCancel();
            }}
            className="inline-flex min-h-[48px] flex-1 items-center justify-center rounded-2xl border border-slate-600 px-4 text-sm font-medium text-slate-200 hover:border-slate-500"
          >
            {INSURANCE_SAFETY_COPY.highAckCancel}
          </button>
        </div>
      </div>
    </div>
  );
}
