import { DISCLAIMER } from "@/lib/constants";
import type { DeepSeekMessage } from "@/lib/deepseek";
import type { VehicleInfo } from "@/lib/types/chat";
import { GARAGE_GENIUS_SYSTEM_PROMPT } from "@/lib/prompts/garage-genius";
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

const PARTS_DATA_EXAMPLE = `[
  {
    "oemNumber": "04465-06170",
    "brand": "Toyota / Bosch",
    "name": "Front Brake Pads",
    "category": "brake",
    "quantity": 1,
    "price": 48.5,
    "purchaseLinks": [
      "https://www.amazon.com/s?k=2018+toyota+camry+se+2.5L+front+brake+pads",
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

  return `## Vehicle Health Profile (auto-loaded from garage)
Treat this as the user's saved vehicle file — confirm it warmly at the start of coaching replies; do not pretend you do not know it.
- Vehicle: ${identity}
- Odometer: ${miles}
- Powertrain: ${vehicle.engine || "unknown"}${vehicle.transmission ? ` · ${vehicle.transmission}` : ""}${vehicle.driveType ? ` · ${vehicle.driveType}` : ""}
- ${lastService}
${notes ? `- ${notes}\n` : ""}If mileage is missing or the symptom is unclear, ask briefly — then coach with best-effort guidance.`;
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
): DeepSeekMessage {
  const fitment = fitmentSearchString(vehicle);
  const skillBlock = formatDiySkillPromptBlock(diySkill);
  const visionNote = hasImage
    ? `
## Photo diagnosis (garage DIY)
- User attached one or more vehicle photos from the garage / under the hood.
- Open with brief empathy, then describe what you see (leaks, wear, cracks, corrosion, warning lights, fluid color, damaged parts).
- Fold findings into Coach Mode: assessment → priority actions → DIY vs shop.
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

  return {
    role: "system",
    content: `${GARAGE_GENIUS_SYSTEM_PROMPT}

${skillBlock}

${marketBlock}

${healthProfile}

${configCard}
${maintenanceSection}
${conflictSection}
${focusHints}
${affiliateSection}

${REPAIR_LOOP_PROMPT}

Coach + fitment rules (this turn):
- Open full replies by confirming the Vehicle Health Profile (year/make/model/mileage) in a natural coach voice.
- When maintenance history is present, reference relevant past jobs (date / mileage / parts) before suggesting repeats.
- For diagnosis / planning replies, follow **Problem → Top 3 causes → Checks → Solution path** from the Repair loop section.
- Use Coach Mode structure for diagnosis / planning; use Live Repair Mode when the user is mid-job.
- Always respond in English — even if the user writes in another language.
- Strictly match this exact vehicle fitment: ${fitment}.
- Specifications must follow **${market}** region manuals and regulations (see Market / Region Context).
- Respect the vehicle's Market / country version — do not mix USDM / EUDM / UKDM specs.
- When building buy links / search queries, prefer: "${fitment} <part name>" and favor retailers appropriate for ${market}.
- Source priority: **Affiliate Catalog > vehicle config card > CONFIG RAG > owner/NHTSA/repair RAG > PARTS RAG > general knowledge**.
- When RAG includes owner reports or NHTSA/recall/EPA data, cite them in plain language (e.g. "Owner reports for this model…", "NHTSA data shows…").
${ragSection}
- For any parts recommendation:
  - If an Affiliate Catalog section is present, use those OEM / brand / price / links first.
  - Otherwise: accurate OEM when possible + 1–2 quality aftermarket brands; realistic local-market prices; US vehicles → Amazon/RockAuto/AutoZone/O'Reilly; EU/UK → note local retailers when relevant.
  - If OEM number is uncertain, explicitly say: "I recommend verifying with your VIN".
  - Never recommend parts for a drivetrain/engine the config card does not list.
- End every reply with this disclaimer exactly: "${DISCLAIMER}".
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
