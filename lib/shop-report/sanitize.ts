/**
 * Education-tone guards for Shop Report LLM output.
 * Softens imperative repair language and insurance coverage claims.
 */

import type { ShopReportFactor, ShopReportPayload } from "@/lib/types/shop-report";
import { applyDiagnosticToneGuards } from "@/lib/diagnostic-tone";
import { applyInsuranceSafetyGuards } from "@/lib/insurance-coverage-rewrite";

function tone(text: string): string {
  return applyInsuranceSafetyGuards(applyDiagnosticToneGuards(text));
}

export function sanitizeShopReportFactors(
  raw:
    | Array<{
        title?: string;
        explanation?: string;
        howToVerify?: string;
      }>
    | null
    | undefined,
): ShopReportFactor[] {
  const out: ShopReportFactor[] = [];
  for (const f of raw || []) {
    const title = (f?.title || "").trim();
    let explanation = (f?.explanation || "").trim();
    const howToVerify = (f?.howToVerify || "").trim();
    if (!title || !explanation) continue;
    if (/replace\b|root cause is\b|you must\b/i.test(explanation)) {
      explanation = `Common causes reported for this combination include considerations around ${title.toLowerCase()}. These are for professional verification only.`;
    }
    explanation = tone(explanation);
    out.push({
      title: tone(title),
      explanation,
      howToVerify: tone(
        howToVerify ||
          "Verify with standard shop procedures and OEM guidance.",
      ),
    });
    if (out.length >= 5) break;
  }
  return out;
}

export function sanitizeShopReportSteps(steps: string[]): string[] {
  return steps
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      if (/^replace\b/i.test(s)) {
        return `Inspect / verify condition related to: ${s.replace(/^replace\b/i, "").trim()}`;
      }
      return tone(s);
    })
    .slice(0, 8);
}

/** Strip invented live-adapter language when the session had no BLE/PID feed. */
export function sanitizeShopReportLiveData(
  liveDataSummary: string | null | undefined,
  transcript: string,
): string | null {
  const text = liveDataSummary?.trim();
  if (!text) return null;
  const hasLiveSession =
    /bluetooth|\bble\b|elm327|freeze-frame from adapter|live pid/i.test(
      transcript,
    );
  if (
    !hasLiveSession &&
    /live obd|realtime|real-time obd|\bpid\s*[0-9a-f]/i.test(text)
  ) {
    return "Owner-provided codes or notes only — no live adapter session in this report.";
  }
  return tone(text);
}

export function applyShopReportToneGuards(
  payload: ShopReportPayload,
): ShopReportPayload {
  return {
    ...payload,
    ownerObservations: {
      symptoms: tone(payload.ownerObservations.symptoms),
      conditions: tone(payload.ownerObservations.conditions),
      checksDone: payload.ownerObservations.checksDone.map(tone),
    },
    diagnosticData: {
      ...payload.diagnosticData,
      liveDataSummary: payload.diagnosticData.liveDataSummary
        ? tone(payload.diagnosticData.liveDataSummary)
        : null,
      dataSourceNote: payload.diagnosticData.dataSourceNote
        ? tone(payload.diagnosticData.dataSourceNote)
        : null,
    },
    contributingFactors: payload.contributingFactors.map((f) => ({
      title: tone(f.title),
      explanation: tone(f.explanation),
      howToVerify: tone(f.howToVerify),
    })),
    checksCompleted: payload.checksCompleted.map(tone),
    technicianNextSteps: sanitizeShopReportSteps(
      payload.technicianNextSteps.map(tone),
    ),
    ownerNotes: payload.ownerNotes ? tone(payload.ownerNotes) : null,
    // Keep NHTSA education block intact (US listed/empty/unavailable).
    recallEducation: payload.recallEducation ?? null,
  };
}

export function flattenShopReportText(payload: ShopReportPayload): string {
  return [
    payload.ownerObservations.symptoms,
    payload.ownerObservations.conditions,
    ...payload.ownerObservations.checksDone,
    payload.diagnosticData.liveDataSummary,
    payload.diagnosticData.dataSourceNote,
    ...payload.contributingFactors.flatMap((f) => [
      f.title,
      f.explanation,
      f.howToVerify,
    ]),
    ...payload.checksCompleted,
    ...payload.technicianNextSteps,
    payload.ownerNotes,
  ]
    .filter(Boolean)
    .join("\n");
}
