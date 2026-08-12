"use client";

import { INSURANCE_SAFETY_COPY } from "@/lib/insurance-safety-copy";

/**
 * Settings → Insurance & safety educational panel (en-US product copy).
 */
export default function InsuranceSafetySettings() {
  return (
    <section
      data-testid="insurance-safety-settings"
      className="rounded-3xl border border-slate-800 bg-[#111827] p-5"
    >
      <h2 className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {INSURANCE_SAFETY_COPY.settingsTitle}
      </h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-slate-300 whitespace-pre-line">
        {INSURANCE_SAFETY_COPY.settingsBody}
      </div>
      <p className="mt-4 text-xs text-slate-500">
        {INSURANCE_SAFETY_COPY.weDontDetermineCoverage}
      </p>
    </section>
  );
}
