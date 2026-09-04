/**
 * Home dashboard health snapshot + next recommended action (pure helpers).
 */

import type { VehicleInfo } from "@/lib/types/chat";
import type { VehicleVitals } from "@/lib/vehicle-vitals";
import type { PredictiveMaintenanceCard } from "@/lib/predictive-maintenance/engine";
import { formatAppDate, formatAppNumber } from "@/lib/format-app-date";

export type HomeActionId =
  | "continue_diagnosis"
  | "finish_diagnosis"
  | "shop_report"
  | "export_shop_report"
  | "view_maintenance"
  | "start_checkin"
  | "describe_symptom"
  | "open_chat"
  | "open_coach"
  | "predictive_howto"
  | "enter_code"
  | "upload_photo"
  | "connect_obd"
  | "obd_settings";

export type HealthKind = "attention" | "maintenance" | "looking_good";

export type HealthSnapshotModel = {
  kind: HealthKind;
  title: string;
  subtitle: string;
  lastUpdatedLabel: string;
  primaryCta: { label: string; action: HomeActionId };
};

export type NextActionModel = {
  title: string;
  body: string;
  primary: {
    label: string;
    action: HomeActionId;
    prompt?: string;
    itemKey?: PredictiveMaintenanceCard["key"];
  };
  secondaryLabel: string;
};

function openCodes(vitals: VehicleVitals | null) {
  return (vitals?.codes || []).filter(Boolean);
}

function formatMileage(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${formatAppNumber(Math.round(n), "en-US")} mi`;
}

function lastUpdatedLabel(
  vehicle: VehicleInfo,
  vitals: VehicleVitals | null,
): string {
  const parts: string[] = ["Last updated"];
  const at = vitals?.updatedAt || vitals?.lastObdAt || vitals?.lastPhotoAt;
  if (at) {
    const d = new Date(at);
    if (!Number.isNaN(d.getTime())) {
      parts.push(formatAppDate(d, "en-US"));
    }
  } else {
    parts.push("just now");
  }
  parts.push("·");
  parts.push(formatMileage(vehicle.mileage));
  return parts.join(" ");
}

export function buildHealthSnapshot(opts: {
  vehicle: VehicleInfo;
  vitals: VehicleVitals | null;
  predictive: PredictiveMaintenanceCard[];
}): HealthSnapshotModel {
  const { vehicle, vitals, predictive } = opts;
  const codes = openCodes(vitals);
  const meta = lastUpdatedLabel(vehicle, vitals);

  if (codes.length > 0) {
    const top = codes
      .slice(0, 2)
      .map((c) => c.code)
      .join(", ");
    const more =
      codes.length > 2 ? ` and ${codes.length - 2} more` : "";
    return {
      kind: "attention",
      title: "Attention needed",
      subtitle: `${top}${more} and related symptoms still open. Continue diagnosis or export for your shop.`,
      lastUpdatedLabel: meta,
      primaryCta: {
        label: "Continue diagnosis",
        action: "continue_diagnosis",
      },
    };
  }

  const due = predictive.filter(
    (p) => p.urgency === "overdue" || p.urgency === "due_soon",
  );
  if (due.length > 0) {
    const names = due
      .slice(0, 2)
      .map((p) => p.title)
      .join(" and ");
    const around = due[0]
      ? Math.round(due[0].nextDueMileage).toLocaleString("en-US")
      : "—";
    return {
      kind: "maintenance",
      title: "Maintenance coming up",
      subtitle: `${names} due around ${around} mi.`,
      lastUpdatedLabel: meta,
      primaryCta: {
        label: "View upcoming maintenance",
        action: "view_maintenance",
      },
    };
  }

  return {
    kind: "looking_good",
    title: "Looking good",
    subtitle: "No open issues. Next check-in based on mileage.",
    lastUpdatedLabel: meta,
    primaryCta: {
      label: "Browse guides",
      action: "open_coach",
    },
  };
}

export function buildNextRecommendedAction(opts: {
  vehicle: VehicleInfo;
  vitals: VehicleVitals | null;
  predictive: PredictiveMaintenanceCard[];
  unfinishedDiagnosisHint?: string | null;
}): NextActionModel {
  const {
    vehicle,
    vitals,
    predictive,
    unfinishedDiagnosisHint,
  } = opts;
  const codes = openCodes(vitals);
  const secondaryLabel = "See all recommendations";

  if (unfinishedDiagnosisHint) {
    return {
      title: `Finish your diagnosis on ${unfinishedDiagnosisHint}`,
      body: "Pick up where you left off — educational checks only, then export for your shop if needed.",
      primary: {
        label: "Continue diagnosis",
        action: "finish_diagnosis",
        prompt: `Continue diagnosing ${unfinishedDiagnosisHint} on my ${vehicle.year} ${vehicle.make} ${vehicle.model}. Keep an educational tone and avoid root-cause assertions.`,
      },
      secondaryLabel,
    };
  }

  const high = predictive.find(
    (p) => p.urgency === "overdue" || p.urgency === "due_soon",
  );
  if (high) {
    const cost = high.estCostUsd
      ? ` — ~$${high.estCostUsd.min}–${high.estCostUsd.max} DIY`
      : high.difficulty === "Easy"
        ? " — easy DIY"
        : "";
    return {
      title: `${high.title} due soon${cost}`,
      body: high.basedOnTypicalIntervals
        ? "Based on typical intervals for your mileage — confirm in your owner's manual."
        : "Based on your maintenance history and current mileage.",
      primary: {
        label: "How to do it",
        action: "predictive_howto",
        itemKey: high.key,
        prompt: high.howToPrompt,
      },
      secondaryLabel,
    };
  }

  if (codes.length > 0) {
    const codeHint = codes[0]?.code || "your recent diagnosis";
    return {
      title: "Export Shop Report for your mechanic",
      body: `Share an educational handoff for ${codeHint}. Always verify with a qualified technician.`,
      primary: {
        label: "Generate Shop Report",
        action: "export_shop_report",
      },
      secondaryLabel,
    };
  }

  return {
    title: "Describe a symptom or enter a code",
    body: "Start a check-in with Chat, or jump in with a common US code (P0420, P0300, P0171, P0455, U0100) — we'll keep it educational.",
    primary: {
      label: "Start Chat",
      action: "describe_symptom",
      prompt: `I'd like a vehicle check-in for my ${vehicle.year} ${vehicle.make} ${vehicle.model} at ${vehicle.mileage || "unknown"} miles. Ask me about symptoms or codes (P0420, P0300, P0171, P0455, U0100 are common US starts). Educational only.`,
    },
    secondaryLabel,
  };
}
