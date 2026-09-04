import { formatDtcRefBlock } from "@/lib/vehicle-data/dtc-local";
import { CRITICAL_RAISED_STATE_PROMPT } from "@/lib/chat-intent-drift";
import { sanitizeAnalysisForCoach } from "@/lib/vision/parse-analysis";
import {
  analysisAsksRetake,
  analysisHasRaisedVehicle,
  isLowTrustAnalysis,
  type ImageAnalysis,
  type ImageAnalysisClientSummary,
  type ImageScene,
} from "@/lib/vision/types";

const VERIFY =
  "Treat IMAGE_ANALYSIS as perception only, not a diagnosis. Do not invent torque, fluid capacity, or part numbers from the image alone. Educational tone only — no root-cause assertion such as “Replace X now”.";

const BRAKE_PAD_RE =
  /\b((?:rear\s+)?brake pads?|rear brakes?|rear pads?)\b/i;

const ENGINE_OR_OBD_SCENES = new Set<ImageScene>(["engine", "obd_screen"]);

/** Owner asked about rear brake/pads but the photo looks like engine/OBD. */
export function imageSceneConflictsWithUserText(
  userText: string,
  analysis: ImageAnalysis,
): boolean {
  if (!userText.trim() || isLowTrustAnalysis(analysis)) return false;
  if (!BRAKE_PAD_RE.test(userText)) return false;
  return ENGINE_OR_OBD_SCENES.has(analysis.scene);
}

export function formatImageSceneConflictNote(scene: ImageScene): string {
  return `[IMAGE_SCENE_CONFLICT] The owner's message mentions rear brake/pads but IMAGE_ANALYSIS.scene is ${scene} (engine/OBD-like). Ask them to confirm the photo matches the question before diagnosing pads. Do not treat OBD codes as brake-pad wear.`;
}

export function formatImageAnalysisBlock(
  analysis: ImageAnalysis,
  sourceModel: string,
  userText?: string,
): string {
  const safe = sanitizeAnalysisForCoach(analysis);
  const payload = {
    condition: safe.condition,
    confidence: safe.confidence,
    scene: safe.scene,
    ocr_text: safe.ocr_text,
    dtc_codes: safe.dtc_codes,
    readings: safe.readings,
    objects: safe.objects,
    safety_flags: safe.safety_flags,
    notes: safe.notes,
  };

  const retake = analysisAsksRetake(safe)
    ? `\nPhoto quality is insufficient (blurry, dark, or unreadable). Ask the owner to retake a clearer, well-lit photo before any DIY steps. Do not invent gauge/OCR/DTC values. Do not write a repair plan from this photo.`
    : `\nPhoto is usable. Write a short educational summary (1–3 sentences) from visible facts only (codes, dipstick marks, tire size). DeepSeek coaches in education-only tone — no root-cause assertion such as “Replace X now”.`;

  const conflict =
    userText && imageSceneConflictsWithUserText(userText, analysis)
      ? `\n${formatImageSceneConflictNote(analysis.scene)}`
      : "";

  const confidence = Number(safe.confidence.toFixed(2));
  return `[IMAGE_ANALYSIS source=${sourceModel} confidence=${confidence}]
${VERIFY}
${JSON.stringify(payload)}${retake}${conflict}`;
}

export function formatPerceptionFailedBlock(): string {
  return `[IMAGE_ANALYSIS source=unavailable confidence=0]
${VERIFY}
{"condition":"unreadable","confidence":0,"scene":"other","ocr_text":[],"dtc_codes":[],"readings":[],"objects":[],"safety_flags":["none"],"notes":"Image recognition failed or is disabled. Ask the owner to describe the photo in text or retake it. Do not invent what the photo shows."}`;
}

export function formatRaisedVehicleImageSafety(): string {
  return `[IMAGE_SAFETY] Photo analysis flagged vehicle_raised. Treat the vehicle as possibly already raised. Do not assume chocks, parking brake, or jack stands are in place.
${CRITICAL_RAISED_STATE_PROMPT}`;
}

export function dtcTextFromAnalysis(analysis: ImageAnalysis | null): string {
  if (!analysis || isLowTrustAnalysis(analysis)) return "";
  return [...analysis.dtc_codes, ...analysis.ocr_text].join(" ");
}

export function mergeDtcAnchors(
  userText: string,
  analysis: ImageAnalysis | null,
): string | null {
  const trusted = analysis && !isLowTrustAnalysis(analysis) ? analysis : null;
  return formatDtcRefBlock(
    [userText, dtcTextFromAnalysis(trusted)].filter(Boolean).join("\n"),
    trusted?.dtc_codes,
  );
}

export function toClientImageSummary(
  analysis: ImageAnalysis,
): ImageAnalysisClientSummary {
  const low = isLowTrustAnalysis(analysis);
  return {
    condition: analysis.condition,
    confidence: analysis.confidence,
    scene: analysis.scene,
    dtc_codes: low ? [] : analysis.dtc_codes.slice(0, 6),
    objects: analysis.objects.slice(0, 6),
    notes: low
      ? "Unclear photo — retake recommended. Readings were not used as facts."
      : analysis.notes.slice(0, 180),
    askRetake: analysisAsksRetake(analysis),
    vehicleRaised: analysisHasRaisedVehicle(analysis),
  };
}
