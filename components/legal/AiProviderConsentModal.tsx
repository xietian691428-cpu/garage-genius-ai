"use client";

import Link from "next/link";
import { Shield } from "lucide-react";
import { AI_CONSENT_COPY } from "@/lib/ai-consent";

type Props = {
  open: boolean;
  onAgree: () => void;
  onDecline: () => void;
};

/**
 * Forced consent before the first DeepSeek call (Guideline 5.1.1 / 5.1.2).
 */
export default function AiProviderConsentModal({
  open,
  onAgree,
  onDecline,
}: Props) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[95] flex items-end justify-center bg-black/75 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-consent-title"
      data-testid="ai-provider-consent-modal"
    >
      <div className="flex max-h-[min(94dvh,100%)] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-slate-700 bg-[#111827] shadow-2xl sm:rounded-3xl">
        <div className="shrink-0 border-b border-slate-800 px-5 pb-4 pt-[max(1.25rem,env(safe-area-inset-top))] sm:pt-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-500/15 text-cyan-300">
            <Shield className="h-5 w-5" aria-hidden />
          </div>
          <h2
            id="ai-consent-title"
            className="mt-3 text-xl font-semibold text-white"
          >
            {AI_CONSENT_COPY.title}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            {AI_CONSENT_COPY.lead}
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Recipient
              </dt>
              <dd className="mt-1 text-slate-200">{AI_CONSENT_COPY.recipient}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Purpose
              </dt>
              <dd className="mt-1 text-slate-200">{AI_CONSENT_COPY.purpose}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Data we may send
              </dt>
              <dd className="mt-1">
                <ul className="list-disc space-y-1 pl-5 text-slate-300">
                  {AI_CONSENT_COPY.dataCategories.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </dd>
            </div>
          </dl>
          <p className="mt-4 text-xs leading-relaxed text-slate-500">
            {AI_CONSENT_COPY.refuse}{" "}
            <Link
              href="/privacy"
              className="text-cyan-400 underline-offset-2 hover:underline"
            >
              Privacy Policy
            </Link>
            {" — "}
            {AI_CONSENT_COPY.privacyHint}
          </p>
        </div>

        <div className="shrink-0 space-y-2 border-t border-slate-800 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            data-testid="ai-consent-agree"
            onClick={onAgree}
            className="flex min-h-[48px] w-full touch-manipulation items-center justify-center rounded-2xl bg-cyan-500 px-4 text-sm font-semibold text-black hover:bg-cyan-400"
          >
            {AI_CONSENT_COPY.agree}
          </button>
          <button
            type="button"
            data-testid="ai-consent-decline"
            onClick={onDecline}
            className="flex min-h-[44px] w-full touch-manipulation items-center justify-center rounded-2xl border border-slate-600 px-4 text-sm text-slate-300 hover:bg-slate-800"
          >
            {AI_CONSENT_COPY.decline}
          </button>
        </div>
      </div>
    </div>
  );
}
