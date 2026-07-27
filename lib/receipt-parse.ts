/**
 * Helpers to map receipt OCR → maintenance_records fields.
 */

import type { ReceiptVisionAnalysis } from "@/lib/types/receipt";
import type {
  MaintenanceCategory,
  MaintenancePartUsed,
  MaintenanceRecordInput,
} from "@/lib/types/maintenance";
import { MAINTENANCE_CATEGORIES } from "@/lib/types/maintenance";

export function normalizeMaintenanceCategory(
  raw: string | null | undefined,
): MaintenanceCategory {
  const v = (raw || "").trim().toLowerCase();
  if ((MAINTENANCE_CATEGORIES as string[]).includes(v)) {
    return v as MaintenanceCategory;
  }
  if (/oil|lube/.test(v)) return "oil";
  if (/brake|pad|rotor/.test(v)) return "brakes";
  if (/tire|wheel/.test(v)) return "tires";
  if (/engine|spark|timing|belt/.test(v)) return "engine";
  if (/batter|alternat|electr|fuse/.test(v)) return "electrical";
  if (/suspen|strut|shock|align/.test(v)) return "suspension";
  if (/filter|cabin|air filter|fuel filter/.test(v)) return "filter";
  return "general";
}

export function partsFromText(partsText: string): MaintenancePartUsed[] {
  return partsText
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((name) => ({ name }));
}

export function partsToText(parts: unknown[] | undefined): string {
  if (!Array.isArray(parts) || !parts.length) return "";
  return parts
    .map((p) => {
      if (typeof p === "string") return p;
      if (p && typeof p === "object" && "name" in p) {
        return String((p as { name: unknown }).name || "").trim();
      }
      return "";
    })
    .filter(Boolean)
    .join(", ");
}

export function draftFromReceiptAnalysis(
  analysis: ReceiptVisionAnalysis,
  vehicleId: string,
): {
  title: string;
  category: string;
  performedAt: string;
  mileage: string;
  costUsd: string;
  partsText: string;
  shopName: string;
  notes: string;
  vehicleId: string;
  source: "receipt";
} {
  const today = new Date().toISOString().slice(0, 10);
  const performedAt =
    analysis.performedAt && /^\d{4}-\d{2}-\d{2}$/.test(analysis.performedAt)
      ? analysis.performedAt
      : today;

  return {
    vehicleId,
    title: (analysis.title || "Service from receipt").trim(),
    category: normalizeMaintenanceCategory(analysis.category),
    performedAt,
    mileage:
      analysis.mileage != null && Number.isFinite(analysis.mileage)
        ? String(Math.round(analysis.mileage))
        : "",
    costUsd:
      analysis.costUsd != null && Number.isFinite(analysis.costUsd)
        ? String(analysis.costUsd)
        : "",
    partsText: (analysis.parts || []).filter(Boolean).join(", "),
    shopName: (analysis.shopName || "").trim(),
    notes: [analysis.notes, analysis.raw_text_glimpse]
      .filter(Boolean)
      .join(" · ")
      .slice(0, 500),
    source: "receipt",
  };
}

export function inputFromDraft(draft: {
  vehicleId: string;
  title: string;
  category: string;
  performedAt: string;
  mileage: string;
  costUsd: string;
  partsText: string;
  shopName: string;
  notes: string;
  source: "manual" | "receipt" | "chat" | "parts";
}): MaintenanceRecordInput {
  const costNum = draft.costUsd.trim()
    ? Number.parseFloat(draft.costUsd)
    : NaN;
  const miles = draft.mileage.trim()
    ? Number.parseInt(draft.mileage, 10)
    : NaN;

  return {
    vehicleId: draft.vehicleId,
    title: draft.title.trim() || "Service record",
    category: normalizeMaintenanceCategory(draft.category),
    performedAt: draft.performedAt || new Date().toISOString().slice(0, 10),
    mileage: Number.isFinite(miles) && miles >= 0 ? miles : undefined,
    costCents: Number.isFinite(costNum)
      ? Math.round(costNum * 100)
      : undefined,
    partsUsed: partsFromText(draft.partsText),
    shopName: draft.shopName.trim() || undefined,
    notes: draft.notes.trim() || undefined,
    description: draft.shopName.trim()
      ? `Shop: ${draft.shopName.trim()}`
      : undefined,
    source: draft.source,
  };
}
