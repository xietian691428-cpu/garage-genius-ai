"use client";

import { CHAT_DISCLAIMER_COPY } from "@/lib/chat-disclaimer";

type Props = {
  mode: "first" | "interval";
  onGotIt: () => void;
  onLearnMore: () => void;
};

export default function ChatDisclaimerBanner({
  mode,
  onGotIt,
  onLearnMore,
}: Props) {
  const body =
    mode === "interval"
      ? CHAT_DISCLAIMER_COPY.intervalBody
      : CHAT_DISCLAIMER_COPY.firstBody;

  return (
    <div
      data-testid="chat-disclaimer-banner"
      data-mode={mode}
      role="note"
      className="mx-auto mb-3 max-w-3xl rounded-2xl border border-amber-500/25 bg-amber-500/10 px-3 py-3 sm:px-4"
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-200/90">
        {CHAT_DISCLAIMER_COPY.firstTitle}
      </p>
      <p className="mt-1.5 text-sm leading-relaxed text-amber-50/95">{body}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          data-testid="chat-disclaimer-got-it"
          onClick={onGotIt}
          className="inline-flex min-h-[44px] touch-manipulation items-center justify-center rounded-xl bg-cyan-500 px-4 text-sm font-semibold text-black hover:bg-cyan-400"
        >
          {CHAT_DISCLAIMER_COPY.gotIt}
        </button>
        <button
          type="button"
          data-testid="chat-disclaimer-learn-more"
          onClick={onLearnMore}
          className="inline-flex min-h-[44px] touch-manipulation items-center justify-center rounded-xl border border-slate-600 px-4 text-sm font-medium text-slate-200 hover:bg-slate-800"
        >
          {CHAT_DISCLAIMER_COPY.learnMore}
        </button>
      </div>
    </div>
  );
}
