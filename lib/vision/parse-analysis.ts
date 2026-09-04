import { extractDtcCodesFromAny } from "@/lib/dtc-parse";
import {
  IMAGE_CONDITIONS,
  IMAGE_SAFETY_FLAGS,
  IMAGE_SCENES,
  isLowTrustAnalysis,
  type ImageAnalysis,
  type ImageCondition,
  type ImageReading,
  type ImageSafetyFlag,
  type ImageScene,
} from "@/lib/vision/types";

function asString(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return "";
}

function asStringList(v: unknown, max = 12): string[] {
  if (!Array.isArray(v)) {
    const one = asString(v);
    return one ? [one] : [];
  }
  const out: string[] = [];
  for (const item of v) {
    const s = asString(item);
    if (s) out.push(s.slice(0, 240));
    if (out.length >= max) break;
  }
  return out;
}

function clipNotes(v: unknown): string {
  return asString(v).replace(/\s+/g, " ").trim().slice(0, 400);
}

function pickEnum<T extends string>(
  v: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  const s = asString(v).toLowerCase().replace(/[\s-]+/g, "_");
  return (allowed as readonly string[]).includes(s)
    ? (s as T)
    : fallback;
}

function clampConfidence(v: unknown): number {
  const n = typeof v === "number" ? v : Number(asString(v));
  if (!Number.isFinite(n)) return 0;
  if (n > 1 && n <= 100) return Math.min(1, n / 100);
  return Math.min(1, Math.max(0, n));
}

function parseReadings(v: unknown): ImageReading[] {
  if (!Array.isArray(v)) return [];
  const out: ImageReading[] = [];
  for (const row of v) {
    if (!row || typeof row !== "object") continue;
    const rec = row as Record<string, unknown>;
    const name = asString(rec.name).slice(0, 64);
    const value = asString(rec.value).slice(0, 64);
    if (!name || !value) continue;
    const unitRaw = asString(rec.unit);
    out.push({
      name,
      value,
      unit: unitRaw ? unitRaw.slice(0, 24) : null,
    });
    if (out.length >= 8) break;
  }
  return out;
}

function collectDtcCodes(explicit: unknown, ocr: string[]): string[] {
  const explicitList = asStringList(explicit, 16);
  const fromExplicit = extractDtcCodesFromAny(explicitList);
  const fromOcr = extractDtcCodesFromAny(ocr.join(" "));
  return [...new Set([...fromExplicit, ...fromOcr])].slice(0, 8);
}

function extractJsonObject(raw: string): unknown | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/u, "")
    .trim();

  try {
    return JSON.parse(unfenced);
  } catch {
    const start = unfenced.indexOf("{");
    const end = unfenced.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(unfenced.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

function parseSafetyFlags(v: unknown): ImageSafetyFlag[] {
  const raw = asStringList(v, 6).map((s) =>
    s.toLowerCase().replace(/[\s-]+/g, "_"),
  );
  const flags = raw.filter((s): s is ImageSafetyFlag =>
    (IMAGE_SAFETY_FLAGS as readonly string[]).includes(s),
  );
  if (!flags.length) return ["none"];
  const withoutNone = flags.filter((f) => f !== "none");
  return withoutNone.length ? [...new Set(withoutNone)] : ["none"];
}

/**
 * Parse Kimi JSON into a strict ImageAnalysis.
 * Non-JSON / empty → null (caller fail-opens).
 */
export function parseImageAnalysis(raw: string | null | undefined): ImageAnalysis | null {
  if (!raw?.trim()) return null;
  const parsed = extractJsonObject(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }
  const rec = parsed as Record<string, unknown>;
  const ocr_text = asStringList(rec.ocr_text, 10);
  const analysis: ImageAnalysis = {
    condition: pickEnum<ImageCondition>(
      rec.condition,
      IMAGE_CONDITIONS,
      "partial",
    ),
    confidence: clampConfidence(rec.confidence),
    scene: pickEnum<ImageScene>(rec.scene, IMAGE_SCENES, "other"),
    ocr_text,
    dtc_codes: collectDtcCodes(rec.dtc_codes, ocr_text),
    readings: parseReadings(rec.readings),
    objects: asStringList(rec.objects, 10).map((s) => s.slice(0, 64)),
    safety_flags: parseSafetyFlags(rec.safety_flags),
    notes: clipNotes(rec.notes),
  };

  return sanitizeAnalysisForCoach(analysis);
}

/** Drop guessed readings and codes when the photo is not trustworthy. */
export function sanitizeAnalysisForCoach(analysis: ImageAnalysis): ImageAnalysis {
  if (!isLowTrustAnalysis(analysis)) return analysis;
  return {
    ...analysis,
    ocr_text: [],
    dtc_codes: [],
    readings: [],
    notes:
      "Photo is unclear or low-confidence — do not treat any reading or DTC as fact; ask for a retake.",
  };
}
