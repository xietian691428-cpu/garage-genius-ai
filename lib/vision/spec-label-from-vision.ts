/**
 * Cautious multimodal → pending spec candidates only.
 * Never unlocks Chat spec gates or writes garage fluids without owner confirm.
 */

import {
  IMAGE_CONFIDENCE_MIN,
  isLowTrustAnalysis,
  type ImageAnalysis,
  type ImageScene,
} from "@/lib/vision/types";

/** Higher bar than general perception — label/table OCR must be clear. */
export const VISION_SPEC_CONFIDENCE_MIN = 0.75;

const SPEC_SCENES = new Set<ImageScene>([
  "fluid_cap_label",
  "spec_table_photo",
  "fluid_level",
  "part_closeup",
]);

export type VisionSpecCandidateField =
  | "oil_viscosity"
  | "oil_capacity"
  | "coolant_spec"
  | "brake_fluid_spec"
  | "atf_spec"
  | "torque_spec";

export type VisionSpecCandidate = {
  field: VisionSpecCandidateField;
  value: string;
  confidence: number;
  source: "vision_ocr";
  needsConfirm: true;
  /** Not OEM-certified; staging only. */
  citeHint: string;
};

function blobFromAnalysis(a: ImageAnalysis): string {
  const readings = a.readings
    .map((r) => `${r.name} ${r.value} ${r.unit || ""}`)
    .join(" ");
  return `${a.ocr_text.join(" ")}\n${readings}\n${a.notes}`.toLowerCase();
}

/**
 * Extract possible specs from high-trust label/table photos.
 * Returns [] on low confidence, wrong scene, or ambiguous OCR.
 */
export function extractVisionSpecCandidates(
  analysis: ImageAnalysis | null | undefined,
): VisionSpecCandidate[] {
  if (!analysis || isLowTrustAnalysis(analysis)) return [];
  if (analysis.confidence < VISION_SPEC_CONFIDENCE_MIN) return [];
  if (analysis.condition !== "clear" && analysis.condition !== "partial") {
    return [];
  }
  if (!SPEC_SCENES.has(analysis.scene) && analysis.scene !== "other") {
    // Allow "other" only when OCR clearly looks like a fluid cap / DOT / viscosity
    const probe = analysis.ocr_text.join(" ");
    if (
      !/\b(0W-|5W-|SAE|DOT[\s-]?[345]|ATF|CVT|coolant|engine oil)\b/i.test(
        probe,
      )
    ) {
      return [];
    }
  }

  const blob = blobFromAnalysis(analysis);
  const out: VisionSpecCandidate[] = [];
  const conf = analysis.confidence;

  const visc = blob.match(/\b(\d+)\s*w\s*-?\s*(\d+)\b/i);
  if (visc) {
    out.push({
      field: "oil_viscosity",
      value: `${Number(visc[1])}W-${Number(visc[2])}`,
      confidence: conf,
      source: "vision_ocr",
      needsConfirm: true,
      citeHint:
        "Photo OCR (not OEM-certified) — ask owner to confirm before saving to garage",
    });
  }

  // Capacity only if explicit oil/coolant wording is adjacent in OCR
  for (const m of blob.matchAll(
    /\b(\d+(?:\.\d+)?)\s*(qts?|quarts?|liters?|litres|l)\b/gi,
  )) {
    const idx = m.index ?? 0;
    const window = blob.slice(Math.max(0, idx - 40), idx + m[0].length + 24);
    if (/\b(engine oil|motor oil|oil capacity|with filter)\b/i.test(window)) {
      const n = m[1]!;
      const u = /qt|quart/i.test(m[2]!) ? "qt" : "L";
      out.push({
        field: "oil_capacity",
        value: `${n} ${u}`,
        confidence: conf,
        source: "vision_ocr",
        needsConfirm: true,
        citeHint:
          "Photo OCR capacity — do not treat as garage fact until owner confirms; verify under-hood / manual",
      });
      break;
    }
  }

  const dot = blob.match(/\bDOT[\s-]?([345](?:\.1)?)\b/i);
  if (dot && /\b(brake|dot)\b/i.test(blob)) {
    out.push({
      field: "brake_fluid_spec",
      value: `DOT-${dot[1]}`,
      confidence: conf,
      source: "vision_ocr",
      needsConfirm: true,
      citeHint:
        "Photo OCR brake fluid — owner confirm required; never teach bleeding from a photo",
    });
  }

  const atf = blob.match(
    /\b((?:toyota\s+)?atf\s*ws|mercon(?:\s*[lv]+)?|dexron(?:[\s-]?[iv0-9]+)?|cvt[\s-]?fluid|ns-2|ns-3)\b/i,
  );
  if (atf) {
    out.push({
      field: "atf_spec",
      value: atf[0]!.replace(/\s+/g, " ").trim(),
      confidence: conf,
      source: "vision_ocr",
      needsConfirm: true,
      citeHint:
        "Photo OCR transmission fluid — if CVT, never recommend conventional ATF substitute; owner confirm before save",
    });
  }

  const torque = blob.match(
    /\b(\d+(?:\.\d+)?)\s*(ft-?lbs?|foot[-\s]?pounds?|n[·.\s-]*m)\b/i,
  );
  if (torque && /\b(torque|drain|plug|ft|n·?m)\b/i.test(blob)) {
    out.push({
      field: "torque_spec",
      value: torque[0]!.replace(/\s+/g, " ").trim(),
      confidence: conf,
      source: "vision_ocr",
      needsConfirm: true,
      citeHint:
        "Photo OCR torque — verify against the manual for THIS fastener; not a Chat anchor until confirmed",
    });
  }

  // Cap to avoid noisy dumps
  return out.slice(0, 4);
}

/**
 * Prompt block: candidates only — never unlock allowlist; never Replace-now.
 */
export function formatVisionSpecCandidateBlock(
  candidates: VisionSpecCandidate[],
): string {
  if (!candidates.length) return "";
  const lines = candidates.map(
    (c) =>
      `- ${c.field}: ${c.value} (confidence=${c.confidence.toFixed(2)}; ${c.citeHint})`,
  );
  return [
    "[VISION_SPEC_CANDIDATE]",
    "Possible specs read from the photo OCR. NOT a garage fact. NOT OEM-certified by Garage Genius.",
    "Do NOT invent additional qt/L/ft-lb. Do NOT write these into the vehicle profile without an explicit owner Save/confirm.",
    "If the photo is ambiguous, say so and ask for a clearer retake or the owner's manual.",
    ...lines,
  ].join("\n");
}

/** True when vision must not be used for any spec talk. */
export function visionSpecShouldDegrade(
  analysis: ImageAnalysis | null | undefined,
): boolean {
  if (!analysis) return true;
  if (isLowTrustAnalysis(analysis)) return true;
  if (analysis.confidence < Math.max(IMAGE_CONFIDENCE_MIN, VISION_SPEC_CONFIDENCE_MIN)) {
    return true;
  }
  return false;
}
