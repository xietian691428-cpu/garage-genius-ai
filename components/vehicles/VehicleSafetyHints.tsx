"use client";

import { useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/lib/supabase";
import type { VehicleMarketCode } from "@/lib/types/vehicle-market";
import type { RecallHint } from "@/lib/vehicle-data/types";
import { fetchSafetyHintsClient } from "@/lib/vehicle-data/safety-hints-client";
import {
  NHTSA_RECALLS_URL,
  NHTSA_RECALL_EMPTY,
  NHTSA_RECALL_FOOTNOTE,
  NHTSA_RECALL_UNAVAILABLE,
  isNhtsaRecallMarket,
  regionalRecallBody,
  regionalRecallI18nKeys,
  regionalRecallTitle,
} from "@/lib/vehicle-data/recall-copy";

type Props = {
  year?: number;
  make?: string;
  model?: string;
  market?: VehicleMarketCode | string | null;
  compact?: boolean;
};

type Payload = {
  unavailable?: boolean;
  total?: number;
  hints?: RecallHint[];
  error?: string;
};

/**
 * Educational safety-campaign card.
 * US: NHTSA YMM list (not VIN completion status).
 * UK/EU/other: honest regional guidance — never a fake local campaign list.
 * Does not replace Chat high-risk callouts (brakes / lifting).
 */
export default function VehicleSafetyHints({
  year,
  make,
  model,
  market,
  compact,
}: Props) {
  const { t } = useTranslation();
  const usMarket = isNhtsaRecallMarket(market);
  const regionalKeys = regionalRecallI18nKeys(market);
  const [payload, setPayload] = useState<Payload | null>(null);

  useEffect(() => {
    if (!usMarket) return;
    if (!year || !make?.trim() || !model?.trim()) return;
    let cancelled = false;
    (async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.access_token) return;
        const json = await fetchSafetyHintsClient({
          year,
          make,
          model,
          market,
          accessToken: session.access_token,
        });
        if (!cancelled) setPayload(json);
      } catch {
        if (!cancelled) setPayload({ unavailable: true, hints: [] });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [usMarket, year, make, model]);

  const text = compact ? "text-[10px]" : "text-[11px]";
  const titleCls = compact ? "text-[11px]" : "text-xs";

  if (!usMarket) {
    return (
      <div
        className={`mt-3 rounded-xl border border-sky-500/25 bg-sky-500/10 ${
          compact ? "px-2.5 py-2" : "px-3 py-2.5"
        }`}
        data-testid="vehicle-safety-hints-regional"
      >
        <p
          className={`flex items-start gap-1.5 font-medium text-sky-100 ${titleCls}`}
        >
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {t(regionalKeys.titleKey, {
            defaultValue: regionalRecallTitle(market),
          })}
        </p>
        <p className={`mt-0.5 text-sky-200/70 ${text}`}>
          {t("recalls.sourceRegional", {
            defaultValue: "Source: regional (not NHTSA)",
          })}
        </p>
        <p className={`mt-1 text-sky-50/85 ${text}`}>
          {t(regionalKeys.bodyKey, {
            defaultValue: regionalRecallBody(market),
          })}
        </p>
      </div>
    );
  }

  const hints = (payload?.hints ?? []).slice(0, 3);
  const loaded = payload != null;
  const emptyOk = loaded && !payload?.unavailable && hints.length === 0;

  if (!loaded) return null;

  return (
    <div
      className={`mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 ${
        compact ? "px-2.5 py-2" : "px-3 py-2.5"
      }`}
      data-testid="vehicle-safety-hints"
    >
      <p
        className={`flex items-start gap-1.5 font-medium text-amber-200 ${titleCls}`}
      >
        <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        {t("recalls.usTitle", {
          defaultValue: "NHTSA safety campaigns (education only)",
        })}
      </p>
      <p className={`mt-0.5 text-amber-200/70 ${text}`}>
        {t("recalls.sourceNhtsa", { defaultValue: "Source: NHTSA" })}
      </p>
      <p className={`mt-1 text-amber-100/80 ${text}`}>
        {t("recalls.usFootnote", { defaultValue: NHTSA_RECALL_FOOTNOTE })}{" "}
        <a
          href={NHTSA_RECALLS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-amber-400/60 underline-offset-2"
        >
          {t("recalls.nhtsaLink", { defaultValue: "nhtsa.gov/recalls" })}
        </a>
      </p>
      {payload?.unavailable ? (
        <p className={`mt-2 text-amber-100/70 ${text}`}>
          {t("recalls.usUnavailable", {
            defaultValue: NHTSA_RECALL_UNAVAILABLE,
          })}
        </p>
      ) : null}
      {emptyOk ? (
        <p className={`mt-2 text-amber-50/90 ${text}`}>
          {t("recalls.usEmpty", { defaultValue: NHTSA_RECALL_EMPTY })}
        </p>
      ) : null}
      {hints.length > 0 ? (
        <ul className={`mt-2 space-y-1.5 ${text} text-amber-50/90`}>
          {hints.map((h) => (
            <li key={h.campaignNumber}>
              <details>
                <summary className="cursor-pointer font-semibold marker:text-amber-300">
                  {h.campaignNumber}
                  {h.component ? ` · ${h.component}` : ""}
                  {h.reportReceivedDate ? ` · ${h.reportReceivedDate}` : ""}
                  <span className="ml-1.5 font-normal text-amber-200/70">
                    {t("recalls.expand", { defaultValue: "Expand" })}
                  </span>
                </summary>
                {h.summary ? (
                  <p className="mt-1 font-normal text-amber-50/80">{h.summary}</p>
                ) : null}
                <p className="mt-1 font-normal text-amber-200/70">
                  {t("recalls.mayBeAffected", {
                    defaultValue:
                      "This year/make/model may be affected. Verify with your VIN on NHTSA or a dealer.",
                  })}
                </p>
              </details>
            </li>
          ))}
        </ul>
      ) : null}
      {typeof payload?.total === "number" && payload.total > hints.length ? (
        <p className="mt-1 text-[10px] text-amber-200/70">
          {t("recalls.showingOf", {
            shown: hints.length,
            total: payload.total,
            defaultValue: `Showing ${hints.length} of ${payload.total} NHTSA campaigns on file for this year/make/model.`,
          })}
        </p>
      ) : null}
    </div>
  );
}
