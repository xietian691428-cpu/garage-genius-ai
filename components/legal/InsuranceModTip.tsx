"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, ChevronDown, ChevronUp, Shield } from "lucide-react";
import type { VehicleInfo } from "@/lib/types/chat";
import { regionTipI18nKey } from "@/lib/insurance-tips";

type Props = {
  vehicle?: VehicleInfo | null;
  /** Force show even without Modified tag / context */
  force?: boolean;
  className?: string;
};

/**
 * Short tip bar + expandable full insurance disclaimer.
 * Education only — no coverage adjudication.
 */
export default function InsuranceModTip({
  vehicle,
  force = true,
  className = "",
}: Props) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  if (!force && !vehicle) return null;

  const provider = vehicle?.insuranceProvider?.trim();
  const shortTip = provider
    ? t("legal.insurance.softTipWithProvider", {
        insurance_provider: provider,
      })
    : t("legal.insurance.softTipDefault");

  const regionTip = t(regionTipI18nKey(vehicle?.countryRegion));

  return (
    <div
      role="note"
      className={`rounded-2xl border border-amber-500/25 bg-amber-500/5 px-3 py-2.5 text-xs leading-relaxed text-amber-100/95 ${className}`}
    >
      <div className="flex items-start gap-2">
        <Shield
          className="mt-0.5 h-4 w-4 shrink-0 text-amber-300"
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-amber-200">
            {t("legal.insurance.tipTitle")}
          </p>
          <p className="mt-1 text-amber-100/90">{shortTip}</p>
          {vehicle?.countryRegion?.trim() ? (
            <p className="mt-1.5 text-[11px] text-amber-100/70">{regionTip}</p>
          ) : null}

          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-amber-300/90 hover:text-amber-200"
            aria-expanded={expanded}
          >
            {expanded ? (
              <ChevronUp className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" aria-hidden />
            )}
            {expanded
              ? t("legal.insurance.hideDisclaimer")
              : t("legal.insurance.showDisclaimer")}
          </button>

          {expanded ? (
            <p className="mt-2 flex gap-1.5 border-t border-amber-500/20 pt-2 text-[11px] text-amber-100/80">
              <AlertTriangle
                className="mt-0.5 h-3.5 w-3.5 shrink-0"
                aria-hidden
              />
              <span>{t("legal.insurance.disclaimer")}</span>
            </p>
          ) : null}

          <div className="mt-2 flex flex-wrap gap-2">
            <span className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] text-amber-200">
              {t("legal.insurance.reviewPolicy")}
            </span>
            <span className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] text-amber-200">
              {t("legal.insurance.contactInsurer")}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
