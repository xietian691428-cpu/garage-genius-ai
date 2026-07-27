"use client";

import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";

type Props = {
  /** Compact footer style (chat bubbles) vs panel block */
  variant?: "footer" | "panel" | "inline";
  className?: string;
};

/**
 * Unified liability disclaimer — Chat / Coach / OBD / Settings.
 */
export default function LiabilityDisclaimer({
  variant = "footer",
  className = "",
}: Props) {
  const { t } = useTranslation();
  const text = t("legal.disclaimer");

  if (variant === "inline") {
    return (
      <p className={`text-[11px] leading-relaxed text-slate-500 ${className}`}>
        {text}
      </p>
    );
  }

  if (variant === "panel") {
    return (
      <div
        role="note"
        className={`rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs leading-relaxed text-amber-100 ${className}`}
      >
        <div className="mb-1.5 flex items-center gap-2 font-semibold text-amber-200">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
          {t("legal.disclaimerTitle")}
        </div>
        {text}
      </div>
    );
  }

  return (
    <div
      role="note"
      className={`mt-3 border-t border-slate-700 pt-3 text-xs leading-relaxed text-amber-400 ${className}`}
    >
      {text}
    </div>
  );
}
