"use client";

import { INSURANCE_SAFETY_COPY } from "@/lib/insurance-safety-copy";
import type { SafetyTier } from "@/lib/safety-tier";

type Props = {
  tier: SafetyTier;
  /** Show modification reminder */
  mods?: boolean;
  className?: string;
  onExportShopReport?: () => void;
};

/**
 * Neutral info strip for Chat / Coach result areas — not a red alarm.
 */
export default function SafetyTierTip({
  tier,
  mods,
  className = "",
  onExportShopReport,
}: Props) {
  if (tier === "low" && !mods) {
    return (
      <p
        data-testid="safety-tier-tip"
        data-tier="low"
        className={`text-[11px] leading-relaxed text-slate-500 ${className}`}
      >
        {INSURANCE_SAFETY_COPY.educationalOnly}
      </p>
    );
  }

  const lines: string[] = [INSURANCE_SAFETY_COPY.educationalOnly];
  if (mods) {
    lines.push(INSURANCE_SAFETY_COPY.modMayAffect);
  }
  if (tier === "medium") {
    lines.push(INSURANCE_SAFETY_COPY.verifyBeforeDriving);
  }
  if (tier === "high") {
    lines.push(INSURANCE_SAFETY_COPY.safetyCriticalMayAffect);
    lines.push(INSURANCE_SAFETY_COPY.safetyCriticalGuideOnly);
  }

  return (
    <div
      data-testid="safety-tier-tip"
      data-tier={tier}
      className={`rounded-2xl border border-slate-700/80 bg-slate-900/50 px-3 py-2.5 text-xs leading-relaxed text-slate-300 ${className}`}
    >
      {lines.map((line) => (
        <p key={line.slice(0, 24)} className="mt-1 first:mt-0">
          {line}
        </p>
      ))}
      {tier === "high" || tier === "medium" ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {onExportShopReport ? (
            <button
              type="button"
              data-testid="safety-tier-shop-report"
              onClick={onExportShopReport}
              className="inline-flex min-h-[40px] items-center rounded-xl bg-cyan-500/90 px-3 text-xs font-semibold text-black hover:bg-cyan-400"
            >
              Export Shop Report
            </button>
          ) : null}
          <span className="inline-flex min-h-[40px] items-center text-[11px] text-slate-500">
            Have a professional verify
          </span>
        </div>
      ) : null}
      {tier === "high" ? (
        <p className="mt-2 text-[11px] text-slate-500">
          {INSURANCE_SAFETY_COPY.exportShopReport}
        </p>
      ) : null}
    </div>
  );
}
