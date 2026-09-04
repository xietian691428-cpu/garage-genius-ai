import { LEGAL_SOFT_LANGUAGE_PROMPT } from "@/lib/legal-disclaimer";
import { DISCLAIMER } from "@/lib/constants";
import type { DeepSeekMessage } from "@/lib/deepseek";
import type { VehicleInfo } from "@/lib/types/chat";
import { GARAGE_GENIUS_SYSTEM_PROMPT } from "@/lib/prompts/garage-genius";
import { REPLY_LANGUAGE_PROMPT } from "@/lib/reply-language";
import {
  fitmentSearchString,
  formatVehicleConfigCard,
} from "@/lib/vcdb/format";
import { formatFocusConfigHints } from "@/lib/vcdb/conflict";
import {
  formatMarketContextBlock,
  normalizeVehicleMarket,
} from "@/lib/types/vehicle-market";
import { REPAIR_LOOP_PROMPT } from "@/lib/chat-repair-loop";
import {
  formatDiySkillPromptBlock,
  type DiySkillLevel,
} from "@/lib/diy-skill";
import {
  formatInsuranceProfileForPrompt,
  INSURANCE_SOFT_LANGUAGE_PROMPT,
} from "@/lib/insurance-tips";
import {
  formatObdPreferencePromptBlock,
  type ObdAdapterPreference,
} from "@/lib/obd-preference";
import { visibleGarageProfileTags } from "@/lib/vehicle-data/ymm-conflict";

const PARTS_DATA_EXAMPLE = `[
  {
    "oemNumber": "04465-06170",
    "brand": "Toyota / Bosch",
    "name": "Front Brake Pads",
    "category": "brake",
    "quantity": 1,
    "price": 48.5,
    "purchaseLinks": [
      "https://www.amazon.com/s?k=2018+toyota+camry+front+brake+pads",
      "https://www.rockauto.com/en/partsearch/?partnum=04465-06170"
    ]
  }
]`;

/** Short coach briefing so every turn opens from the saved garage profile. */
function formatVehicleHealthProfile(vehicle: VehicleInfo): string {
  const identity = [
    vehicle.year,
    vehicle.make,
    vehicle.model,
    vehicle.submodel,
  ]
    .filter(Boolean)
    .join(" ");
  const miles =
    vehicle.mileage != null && Number(vehicle.mileage) > 0
      ? `${Number(vehicle.mileage).toLocaleString()} miles`
      : "mileage not saved yet";
  const lastService = vehicle.lastMaintenance
    ? `Last logged service: ${vehicle.lastMaintenance}.`
    : "No last-service date saved yet.";
  const notes = vehicle.notes?.trim()
    ? `Owner notes: ${vehicle.notes.trim()}`
    : null;
  const visibleTags = visibleGarageProfileTags(vehicle.tags);
  const tags = visibleTags.length
    ? `Profile tags: ${visibleTags.join(", ")}`
    : null;
  const insuranceBlock = formatInsuranceProfileForPrompt(vehicle);

  return `## Vehicle Health Profile (auto-loaded from garage)
Treat this as the user's saved vehicle file — confirm it warmly at the start of coaching replies; do not pretend you do not know it.
- Vehicle: ${identity}
- Odometer: ${miles}
- Powertrain: ${vehicle.engine || "unknown"}${vehicle.transmission ? ` · ${vehicle.transmission}` : ""}${vehicle.driveType ? ` · ${vehicle.driveType}` : ""}
- ${lastService}
${tags ? `- ${tags}\n` : ""}${notes ? `- ${notes}\n` : ""}${insuranceBlock ? `\n${insuranceBlock}\n` : ""}If mileage is missing or the symptom is unclear, ask briefly — then coach with best-effort guidance. Never invent a service-due mileage or interval when odometer is not saved.`;
}

export function buildChatSystemPrompt(
  vehicle: VehicleInfo,
  hasImage: boolean,
  /** Pre-formatted RAG block from ragService.formatKnowledgeForPrompt */
  ragContext?: string | null,
  /** Optional config-conflict notes from detectConfigConflicts */
  conflictContext?: string | null,
  /** Pre-matched Admin affiliate_parts catalog (priority over AI invention) */
  affiliateCatalog?: string | null,
  /** Recent maintenance_records summary for multi-turn continuity */
  maintenanceHistory?: string | null,
  /** DIY skill band for tone / depth */
  diySkill?: DiySkillLevel | string | null,
  /** Optional OBD adapter ownership preference */
  obdPreference?: ObdAdapterPreference | null,
  /** Read-only NHTSA/EPA/DTC anchors — never rewritten by the model */
  factAnchors?: string | null,
): DeepSeekMessage {
  const fitment = fitmentSearchString(vehicle);
  const skillBlock = formatDiySkillPromptBlock(diySkill);
  const obdPrefBlock = formatObdPreferencePromptBlock(obdPreference);
  const visionNote = hasImage
    ? `
## Photo diagnosis (garage DIY)
- The user attached a vehicle photo. Kimi (Moonshot) may have produced a read-only [IMAGE_ANALYSIS] block — perception only, not a diagnosis.
- Treat IMAGE_ANALYSIS as observations. Do not invent torque, fluid capacity, or part numbers from the image alone.
- Educational tone; no root-cause assertion such as "Replace X now".
- If condition is blurry, dark, or unreadable, or confidence is below 0.5: ask for a clearer photo. Do not treat IMAGE_ANALYSIS readings, OCR, or dtc_codes as facts. Do not invent gauge or OCR readings.
- If [IMAGE_SCENE_CONFLICT] is present, confirm the photo matches the question before diagnosing the named part.
- Open with brief empathy, then coach from visible clues plus the Vehicle Health Profile.
- **Required:** emit a Focus Mode marker for the primary area, e.g. <focus>brakes</focus> or <focus>engine</focus> (brakes | engine | suspension | battery | tires | hvac | ac | transmission | lights).
- Prefer a short <focus-data>…</focus-data> block with part, message, and first action step when the area is clear.`
    : "";

  const ragSection = ragContext?.trim()
    ? `\n${ragContext.trim()}\n`
    : `\n## Retrieved Knowledge (FTS / Hybrid RAG)\nNo matching knowledge entries were retrieved. Rely on the Vehicle Health Profile + Authoritative Vehicle Configuration below, use sound maintenance practice, and ask clarifying questions when needed.\n`;

  const conflictSection = conflictContext?.trim()
    ? `\n${conflictContext.trim()}\n`
    : "";

  const affiliateSection = affiliateCatalog?.trim()
    ? `\n${affiliateCatalog.trim()}\n`
    : "";

  const maintenanceSection = maintenanceHistory?.trim()
    ? `\n${maintenanceHistory.trim()}\n`
    : "";

  // Always inject full VCdb / garage config card + market context every turn
  const healthProfile = formatVehicleHealthProfile(vehicle);
  const configCard = formatVehicleConfigCard(vehicle);
  const marketBlock = formatMarketContextBlock(vehicle);
  const market = normalizeVehicleMarket(vehicle.market);
  const focusHints = formatFocusConfigHints(vehicle);
  const factSection = factAnchors?.trim()
    ? `\n${factAnchors.trim()}\n`
    : "";

  return {
    role: "system",
    content: `${GARAGE_GENIUS_SYSTEM_PROMPT}

${REPLY_LANGUAGE_PROMPT}

${skillBlock}

${obdPrefBlock}

${marketBlock}

${healthProfile}

${configCard}
${factSection}
${maintenanceSection}
${conflictSection}
${focusHints}
${affiliateSection}

${REPAIR_LOOP_PROMPT}

${LEGAL_SOFT_LANGUAGE_PROMPT}

${INSURANCE_SOFT_LANGUAGE_PROMPT}

Coach + fitment rules (this turn):
- Open full replies by confirming the Vehicle Health Profile (year/make/model/mileage) in a natural coach voice.
- When maintenance history is present, reference relevant past jobs (date / mileage / parts) before suggesting repeats.
- For diagnosis / planning replies, follow **Problem → Top 3 causes → Checks → Solution path** from the Repair loop section.
- Use Coach Mode structure for diagnosis / planning; use Live Repair Mode when the user is mid-job.
- Reply language is English or Spanish only (see Reply language section); **never use Chinese characters**. Settings UI locale does not override it.
- Focus Mode: <focus> part ids stay English; user-visible <focus-data> strings match the reply language (en/es only).
- Strictly match this exact vehicle fitment: ${fitment}.
- Specifications must follow **${market}** region manuals and regulations (see Market / Region Context).
- Units: ${
    market === "US"
      ? "default US customary (qt, PSI, ft-lb). If the owner's latest message used L, bar, kPa, or N·m, follow those units."
      : "follow the owner's units and this vehicle market."
  } Do not give two unexplained contradictory numbers for the same quantity. If [UNIT_PREF] is present, follow it.
- Respect the vehicle's Market / country version — do not mix USDM / EUDM / UKDM specs.
- When building buy links / search queries, prefer: "${fitment} <part name>" and favor retailers appropriate for ${market}.
- For Amazon: use KEYWORD SEARCH URLs only (https://www.amazon.com/s?k=YEAR+MAKE+MODEL+PART). Never invent /dp product deep links or Associates tags.
- Source priority: **Affiliate Catalog > vehicle config card > official NHTSA/EPA/DTC anchors > CONFIG RAG > owner/NHTSA/repair RAG > PARTS RAG > general knowledge**.
- If [VEHICLE_CONFLICT] is present, confirm the vehicle identity with the owner before quoting model-specific specs or steps. Do not mix garage year/make/model with the vPIC snapshot.
- If [YMM_UNVERIFIED] is present, treat year/make/model as hand-entered and unconfirmed by VIN decode; ask once to confirm before quoting capacity, torque, or campaign lists.
- If [ANCHOR_STATUS] is present, treat it as source health for this turn. If recalls=unavailable, regional, or skipped, do not say "according to NHTSA there are no recalls" and do not invent campaign lists. If epa=unavailable or skipped, do not invent EPA city/highway/combined MPG. If vpic=none, do not claim a fresh NHTSA vPIC decode. Spec hard rules still apply when official sources are degraded.
- When [VEHICLE_ANCHOR], [RECALL_HINTS], [DTC_REF], [EPA_MPG], or [DIY_PATH] blocks are present, quote those official figures and follow the educational check order; do not invent different NHTSA campaign numbers or EPA MPG. Recalls are education only — never claim a recall is completed, inapplicable, or that a part must be replaced today. If [RECALL_HINTS] is regional (UK/EU/other), do not present a NHTSA campaign list as applying to that vehicle. If [DTC_REF] is present, use its title, summary, and diy_level to order checks; do not invent OEM definitions for unknown codes. Never use root-cause orders such as "Replace X now", "It's definitely", or "Must be the…".
- Spec hard rule: without a **garage-saved** oil capacity/viscosity, affiliate OEM number, or an official [VEHICLE_ANCHOR]/[EPA_MPG]/[DIY_PATH] figure for THIS vehicle this turn, do not invent oil/coolant capacity (qt/L), treat 0W-xx as required, torque (ft-lb / N·m), or OEM part numbers. Say to use the owner's manual, fill cap, or door sticker. Curated lookup oil on the UI card is not a Chat fact.
- When a garage-saved oil figure or affiliate OEM **is** present, quote it and name the source (garage profile / affiliate catalog); still say to confirm on the cap or with VIN.
- If [DTC_REF] is present: list every local REF line before check order. Safety-related codes (SRS/ABS/lost-comm, diy_level=shop) before pure emissions (catalyst/EVAP). Single code: Meaning → Likely causes (list) → Checks → When to go to a shop. Unknown codes stay on the generic template — do not invent OEM titles or TSBs. If any diy_level=shop, prefer a shop path; DIY is observe-only.
- If [EPA_MPG] lists official city/highway/combined numbers and the user asked MPG / fuel economy, quote those numbers. If [EPA_MPG] says the source is unavailable this turn, skip invented MPG and tell the owner to use the window sticker or fueleconomy.gov.
- If [DIY_PATH] is present, follow its check order and stop-DIY lines; keep high-risk callouts consistent with matched safety topics.
- Reply language follows the user's latest message (hard lock). If they ask "any recalls?", answer in that language using [RECALL_HINTS] only.
- When RAG includes owner reports or NHTSA/recall/EPA data, cite them in plain language (e.g. "Owner reports for this model…", "NHTSA data shows…") only if [ANCHOR_STATUS] shows that source as listed/ok this turn.
${ragSection}
- For any parts recommendation:
  - If an Affiliate Catalog section is present, use those OEM / brand / price values first; Amazon links must still be keyword search.
  - Otherwise: accurate OEM when possible + 1–2 quality aftermarket brands; realistic local-market prices; US vehicles → Amazon search / RockAuto / AutoZone / O'Reilly; EU/UK → note local retailers when relevant.
  - Tell the owner to compare sellers and verify fitment before buying.
  - If OEM number is uncertain, explicitly say: "I recommend verifying with your VIN".
  - Never recommend parts for a drivetrain/engine the config card does not list.
- End every reply with a full liability disclaimer in the **same language as the reply** (example EN text if the reply is English: "${DISCLAIMER}").
${visionNote}

Output Format when parts are needed (still wrap inside Coach Mode prose):
1. Clear explanation + diagnostic reasoning (respect config conflicts first)
2. Markdown table with columns: Part | OEM # | Brand | Price | Links
3. At the END, output a valid JSON block wrapped in <parts-data>...</parts-data>

JSON Schema Example:
<parts-data>
${PARTS_DATA_EXAMPLE}
</parts-data>

Rules for <parts-data>:
- Return a JSON array only.
- Include every part from your markdown table.
- Use this schema per object:
  {
    "oemNumber": "string",
    "brand": "string",
    "name": "string",
    "category": "brake|engine|filter|suspension|electrical|consumable|other",
    "quantity": number,
    "price": number,
    "purchaseLinks": ["https://...", "https://..."]
  }
- Never hallucinate OEM numbers. If unsure, say "I recommend verifying with your VIN".

Focus Mode markers (required when a primary area is clear):
- Emit <focus>engine</focus> (or brakes | suspension | battery | tires | hvac | ac | transmission | lights).
- Prefer Focus areas consistent with the Authoritative Vehicle Configuration and CONFIG RAG tier.
- Optionally emit richer JSON in <focus-data>...</focus-data> with type, part, message, action, steps, tools, safetyNotes.
- When RAG knowledge points to a clear area/category, align your Focus marker with it — but never override a high-severity config conflict.
- Place Focus markers before the disclaimer.`,
  };
}
