"use client";

import Link from "next/link";
import { Clock, Sparkles, X } from "lucide-react";
import {
  formatTrialCountdown,
  formatTrialEndDate,
  type ResolvedSubscription,
} from "@/lib/subscription";

type TrialStatusBannerProps = {
  resolved: ResolvedSubscription;
  loading?: boolean;
  className?: string;
};

/** Active trial countdown. CTAs go to /pricing (IAP in store shell; Stripe on web). */
export function TrialStatusBanner({
  resolved,
  loading,
  className = "",
}: TrialStatusBannerProps) {
  if (loading || !resolved.isTrialing) return null;

  const countdown = formatTrialCountdown(resolved);
  const endDate = formatTrialEndDate(resolved);

  return (
    <div
      className={`rounded-2xl border border-cyan-500/35 bg-gradient-to-r from-cyan-500/15 to-emerald-500/10 px-4 py-3 sm:px-5 ${className}`}
    >
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-500/20 text-cyan-300">
          <Clock className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white">
            You&apos;re on a Pro Trial
          </p>
          <p className="text-xs text-slate-300 sm:text-sm">
            {countdown}
            {endDate ? ` · ends ${endDate}` : ""}
          </p>
        </div>
        <Link
          href="/pricing"
          className="inline-flex items-center gap-1.5 rounded-xl bg-cyan-500 px-3 py-2 text-xs font-semibold text-black hover:bg-cyan-400"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Keep Pro
        </Link>
      </div>
    </div>
  );
}

type TrialEndedModalProps = {
  open: boolean;
  onClose: () => void;
};

/** Friendly upgrade prompt after trial auto-downgrades to Free. */
export function TrialEndedModal({ open, onClose }: TrialEndedModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-black/70 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="trial-ended-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-3xl border border-slate-700 bg-[#111827] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-300">
            <Sparkles className="h-5 w-5" />
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <h2
          id="trial-ended-title"
          className="mt-4 text-xl font-semibold text-white"
        >
          Your Pro Trial has ended
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          You&apos;re back on Free — still great for basics, but voice coaching,
          multi-vehicle, and deeper RAG are Pro. Upgrade anytime to pick up where
          you left off.
        </p>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Link
            href="/pricing"
            onClick={onClose}
            className="flex flex-1 items-center justify-center rounded-2xl bg-cyan-500 px-4 py-3 text-sm font-semibold text-black hover:bg-cyan-400"
          >
            View plans
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="flex flex-1 items-center justify-center rounded-2xl border border-slate-700 px-4 py-3 text-sm text-slate-300 hover:border-slate-500"
          >
            Continue on Free
          </button>
        </div>
      </div>
    </div>
  );
}
