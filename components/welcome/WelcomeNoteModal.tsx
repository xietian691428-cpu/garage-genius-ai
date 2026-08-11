"use client";

import { X } from "lucide-react";
import { WELCOME_NOTE_FEEDBACK_MAILTO } from "@/lib/welcome-note";

type Props = {
  open: boolean;
  onDismiss: () => void;
};

/**
 * Lightweight one-time early-access / co-create note (en-US).
 * Got it / X / backdrop all mark as seen via onDismiss.
 */
export default function WelcomeNoteModal({ open, onDismiss }: Props) {
  if (!open) return null;

  return (
    <div
      data-testid="welcome-note-modal"
      className="fixed inset-0 z-[85] flex items-end justify-center overflow-y-auto bg-black/60 p-4 sm:items-center sm:pt-[max(1rem,env(safe-area-inset-top))] sm:pb-[max(1rem,env(safe-area-inset-bottom))]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-note-title"
      onClick={onDismiss}
    >
      <div
        className="mb-[max(0.5rem,env(safe-area-inset-bottom))] w-full max-w-md rounded-3xl border border-slate-700 bg-[#111827] p-5 shadow-2xl sm:mb-0 sm:p-6"
        style={{ WebkitOverflowScrolling: "touch" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-cyan-400/90">
            Early access
          </p>
          <button
            type="button"
            data-testid="welcome-note-close"
            onClick={onDismiss}
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <h2
          id="welcome-note-title"
          className="mt-2 text-xl font-semibold leading-snug text-white"
        >
          Thanks for being here early.
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-300">
          AI is moving fast, and we&apos;re building Garage Genius right at the
          edge of what&apos;s possible for car owners. Some parts may still feel
          rough — we&apos;re on it, and we&apos;re committed to making this the
          most useful automotive coach app you use.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-slate-400">
          Your feedback genuinely shapes what we build next.
        </p>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            data-testid="welcome-note-dismiss"
            onClick={onDismiss}
            className="inline-flex min-h-[48px] flex-1 items-center justify-center rounded-2xl bg-cyan-500 px-4 text-sm font-semibold text-black hover:bg-cyan-400"
          >
            Got it
          </button>
          <a
            data-testid="welcome-note-feedback"
            href={WELCOME_NOTE_FEEDBACK_MAILTO}
            onClick={onDismiss}
            className="inline-flex min-h-[48px] flex-1 items-center justify-center rounded-2xl border border-slate-600 px-4 text-sm font-medium text-slate-200 hover:border-cyan-500/40"
          >
            Send feedback
          </a>
        </div>
      </div>
    </div>
  );
}
