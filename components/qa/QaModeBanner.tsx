"use client";

import { isQaUnlockEnabled } from "@/lib/qa-mode";

/** Sticky notice while QA unlock is on — reminds team to disable before launch. */
export default function QaModeBanner() {
  if (!isQaUnlockEnabled()) return null;

  return (
    <div
      role="status"
      className="shrink-0 border-b border-amber-500/40 bg-amber-500/15 px-3 py-2 text-center text-xs text-amber-100 sm:text-sm"
    >
      <span className="font-semibold text-amber-200">QA test mode</span>
      {" — "}
      All Pro Heavy features unlocked. Payments disabled until launch.
    </div>
  );
}
