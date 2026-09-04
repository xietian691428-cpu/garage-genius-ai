import type { DeepSeekMessage } from "@/lib/deepseek";
import type { VehicleInfo } from "@/lib/types/chat";
import type { ShopReportDtc } from "@/lib/types/shop-report";
import { SHOP_REPORT_DISCLAIMER, SHOP_REPORT_DTC_NOTE } from "@/lib/types/shop-report";

export function buildShopReportMessages(input: {
  vehicle: VehicleInfo;
  transcript: string;
  codes: ShopReportDtc[];
  ownerNotes: string;
  source: "chat" | "coach";
  coachContext?: string;
}): DeepSeekMessage[] {
  const ymm = `${input.vehicle.year} ${input.vehicle.make} ${input.vehicle.model}`;
  const codeLines =
    input.codes.length > 0
      ? input.codes
          .map((c) => {
            const hit = c.catalogHit === false ? "generic family" : "local catalog";
            return `- ${c.code}: ${c.definition}${c.severity ? ` [${c.severity}]` : ""} (${hit})`;
          })
          .join("\n")
      : "- (none extracted)";

  const system = `You are Garage Genius AI writing an Owner Diagnostic Summary for a professional repair shop.

STRICT RULES:
- Education / communication aid only — NOT a final diagnosis or repair order.
- Use humble professional English for US/EU shops.
- NEVER say "Replace X", "The root cause is Y", "You must…", or claim certainty.
- NEVER claim insurance will / will not cover, void a policy, or approve a repair for claims.
- DTC titles in this prompt are local SAE-style labels for communication — not a diagnosis. Do not invent OEM definitions, torque, or part numbers from a code.
- Do not invent NHTSA campaign numbers. Recall education (if any) is attached by the app.
- Prefer: "Common causes reported for this combination include…" and "These are for professional verification only."
- Prefer insurance language: "may affect coverage", "check your policy or insurer".
- Possible contributing factors: 3–5 items, ranked by likelihood, each with short explanation + how a tech might verify.
- Suggested next steps: verification-oriented verbs (Verify, Inspect, Measure, Perform…) — never directive parts replacement.
- Owner checks: concrete past-tense observations only when supported by the transcript; otherwise omit or mark as "Owner reported…".
- Return JSON only matching the schema.`;

  const user = `Build a shop handoff summary JSON for:

Vehicle: ${ymm}
Mileage: ${input.vehicle.mileage || "unknown"}
Source: ${input.source}
Owner notes (optional): ${input.ownerNotes.trim() || "(none)"}

Known DTCs (local titles only — ${SHOP_REPORT_DTC_NOTE}):
${codeLines}

${input.coachContext ? `Coach guide context:\n${input.coachContext}\n` : ""}

Chat / session transcript:
${input.transcript || "(empty)"}

Return JSON:
{
  "symptoms": "clear owner symptom narrative (lightly polished English)",
  "conditions": "when it happens (cold/hot/accel/idle/etc) or empty string",
  "checksDone": ["owner checks already performed"],
  "liveDataSummary": "brief freeze-frame / live data summary or null",
  "dataSourceNote": "e.g. OBD screenshot OCR / manual code entry / BLE session + timing hint, or null",
  "contributingFactors": [
    { "title": "...", "explanation": "Common causes reported…", "howToVerify": "..." }
  ],
  "checksCompleted": ["normalized list for the Checks Already Completed section"],
  "technicianNextSteps": ["Verify…", "Inspect…"]
}

Disclaimer text will be appended by the app (do not invent another):
${SHOP_REPORT_DISCLAIMER}`;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}
