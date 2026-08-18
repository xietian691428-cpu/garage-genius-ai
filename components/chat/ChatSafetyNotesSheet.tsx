"use client";

import Link from "next/link";
import { X } from "lucide-react";
import { CHAT_DISCLAIMER_COPY } from "@/lib/chat-disclaimer";
import LiabilityDisclaimer from "@/components/legal/LiabilityDisclaimer";
import SafetyTierTip from "@/components/legal/SafetyTierTip";
import type { SafetyTier } from "@/lib/safety-tier";
import { INSURANCE_SAFETY_COPY } from "@/lib/insurance-safety-copy";

type Props = {
  open: boolean;
  onClose: () => void;
  sessionSafety?: { tier: SafetyTier; mods: boolean } | null;
  onGenerateShopReport?: () => void;
};

/**
 * Always-available full Safety & Disclaimer sheet (not DeepSeek consent).
 */
export default function ChatSafetyNotesSheet({
  open,
  onClose,
  sessionSafety,
  onGenerateShopReport,
}: Props) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[88] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="chat-safety-notes-title"
      data-testid="chat-safety-notes-sheet"
      onClick={onClose}
    >
      <div
        className="flex max-h-[min(92dvh,100%)] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-slate-700 bg-[#111827] shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative shrink-0 border-b border-slate-800 px-5 pb-3 pt-[max(1.25rem,env(safe-area-inset-top))] sm:pt-5">
          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 top-[max(0.75rem,env(safe-area-inset-top))] min-h-[44px] min-w-[44px] touch-manipulation rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white sm:top-3"
            aria-label={CHAT_DISCLAIMER_COPY.close}
          >
            <X className="h-5 w-5" />
          </button>
          <h2
            id="chat-safety-notes-title"
            className="pr-12 text-lg font-semibold text-white"
          >
            {CHAT_DISCLAIMER_COPY.sheetTitle}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            {CHAT_DISCLAIMER_COPY.sheetLead}
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          <ul className="list-disc space-y-2 pl-5 text-sm text-slate-300">
            {CHAT_DISCLAIMER_COPY.sheetBullets.map((line) => (
              <li key={line.slice(0, 32)}>{line}</li>
            ))}
          </ul>

          <div className="mt-4">
            <LiabilityDisclaimer variant="panel" />
          </div>

          {sessionSafety &&
          (sessionSafety.tier !== "low" || sessionSafety.mods) ? (
            <div className="mt-4 rounded-2xl border border-slate-700/80 bg-slate-900/50 px-3 py-3">
              <p className="mb-2 text-[11px] text-slate-500">
                {INSURANCE_SAFETY_COPY.possibleFactorsOnly}{" "}
                {INSURANCE_SAFETY_COPY.nextStepOptions}
              </p>
              <SafetyTierTip
                tier={sessionSafety.tier}
                mods={sessionSafety.mods}
                onExportShopReport={onGenerateShopReport}
              />
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-3 text-sm">
            <Link
              href="/privacy"
              className="text-cyan-400 underline-offset-2 hover:underline"
              onClick={onClose}
            >
              {CHAT_DISCLAIMER_COPY.privacy}
            </Link>
            <Link
              href="/terms"
              className="text-cyan-400 underline-offset-2 hover:underline"
              onClick={onClose}
            >
              {CHAT_DISCLAIMER_COPY.terms}
            </Link>
          </div>
        </div>

        <div className="shrink-0 border-t border-slate-800 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            data-testid="chat-safety-notes-close"
            onClick={onClose}
            className="flex min-h-[48px] w-full touch-manipulation items-center justify-center rounded-2xl bg-cyan-500 text-sm font-semibold text-black hover:bg-cyan-400"
          >
            {CHAT_DISCLAIMER_COPY.close}
          </button>
        </div>
      </div>
    </div>
  );
}
