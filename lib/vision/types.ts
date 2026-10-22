/**
 * Chat photo perception (Kimi) — structured JSON only.
 * DeepSeek coaches from this; Kimi must not emit a repair plan.
 */

export const CHAT_VISION_MAX_IMAGES = 1;
export const IMAGE_CONFIDENCE_MIN = 0.5;

export const IMAGE_CONDITIONS = [
  "clear",
  "blurry",
  "dark",
  "partial",
  "unreadable",
] as const;

export type ImageCondition = (typeof IMAGE_CONDITIONS)[number];

export const IMAGE_SCENES = [
  "obd_screen",
  "engine",
  "gauge",
  "fluid_level",
  "part_closeup",
  "underbody",
  "tire",
  "headlight_housing",
  "other",
] as const;

export type ImageScene = (typeof IMAGE_SCENES)[number];

export const IMAGE_SAFETY_FLAGS = [
  "vehicle_raised",
  "hot_surface",
  "none",
] as const;

export type ImageSafetyFlag = (typeof IMAGE_SAFETY_FLAGS)[number];

/** W10b: rear-of-lamp / dust-cap vs sealed heatsink guess. */
export const HOUSING_GUESSES = [
  "dust_cap",
  "sealed_heatsink",
  "unclear",
] as const;

export type HousingGuess = (typeof HOUSING_GUESSES)[number];

export const HOUSING_CONFIDENCES = ["high", "low"] as const;

export type HousingConfidence = (typeof HOUSING_CONFIDENCES)[number];

export type ImageReading = {
  name: string;
  value: string;
  unit: string | null;
};

export type ImageAnalysis = {
  condition: ImageCondition;
  confidence: number;
  scene: ImageScene;
  ocr_text: string[];
  dtc_codes: string[];
  readings: ImageReading[];
  objects: string[];
  safety_flags: ImageSafetyFlag[];
  notes: string;
  /** Optional W10b housing structure assist — never a bulb size. */
  housing_guess: HousingGuess;
  housing_confidence: HousingConfidence;
};

/** Small payload for Chat UI (no raw image, no huge OCR dumps). */
export type ImageAnalysisClientSummary = {
  condition: ImageCondition;
  confidence: number;
  scene: ImageScene;
  dtc_codes: string[];
  objects: string[];
  notes: string;
  askRetake: boolean;
  vehicleRaised: boolean;
  housing_guess?: HousingGuess;
  housing_confidence?: HousingConfidence;
};

export function isLowTrustAnalysis(a: ImageAnalysis): boolean {
  return (
    a.confidence < IMAGE_CONFIDENCE_MIN ||
    a.condition === "blurry" ||
    a.condition === "dark" ||
    a.condition === "unreadable"
  );
}

export function analysisAsksRetake(a: ImageAnalysis): boolean {
  return isLowTrustAnalysis(a);
}

export function analysisHasRaisedVehicle(a: ImageAnalysis): boolean {
  return a.safety_flags.includes("vehicle_raised");
}

/** High-confidence housing assist usable for ephemeral intake (not bulb size). */
export function highConfidenceHousingAssist(
  a: ImageAnalysis | null | undefined,
): {
  housing_guess: "dust_cap" | "sealed_heatsink" | "unclear";
  housing_confidence: "high" | "low";
} | null {
  if (!a || isLowTrustAnalysis(a)) {
    return a
      ? { housing_guess: "unclear", housing_confidence: "low" }
      : null;
  }
  if (a.housing_confidence !== "high") {
    return {
      housing_guess: a.housing_guess || "unclear",
      housing_confidence: "low",
    };
  }
  if (
    a.housing_guess === "dust_cap" ||
    a.housing_guess === "sealed_heatsink"
  ) {
    return {
      housing_guess: a.housing_guess,
      housing_confidence: "high",
    };
  }
  return {
    housing_guess: "unclear",
    housing_confidence: "low",
  };
}
