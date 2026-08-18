/**
 * DIY chat repair loop helpers — diagnosis → checks → parts → verify.
 * Does not touch CoachScenarioPlayer / playbook JSON.
 */

import type { ChatMessage, VehicleInfo } from "@/lib/types/chat";
import { maskParkingBrakeMentions } from "@/lib/safety-topics";
import type { MaintenanceRecord } from "@/lib/types/maintenance";
import { listRecommendedCoachPlaybooks } from "@/lib/coach-scenarios/catalog";
import { getDtcFollowUpChips, textHasDtcSignal } from "@/lib/dtc";

/** Max messages sent to the model (keeps recent turns; welcome stripped). */
export const CHAT_API_MESSAGE_WINDOW = 24;

export type StarterChip = {
  id: string;
  label: string;
  prompt: string;
};

/** Empty-state / welcome quick starts (ChatGPT-style). */
export const CHAT_STARTER_CHIPS: StarterChip[] = [
  {
    id: "noise",
    label: "Strange noise",
    prompt:
      "I'm hearing an unusual noise while driving. Give me the top 3 most likely causes for THIS vehicle (ranked), a short DIY check for each, then the best next step. Ask at most one clarifying question if needed.",
  },
  {
    id: "light",
    label: "Warning light",
    prompt:
      "A warning light came on. Ask what color/symbol I see (one question), then give the top 3 likely causes with safe DIY checks before parts. Structure as Problem → Checks → Solution path.",
  },
  {
    id: "brake",
    label: "Brake feel",
    prompt:
      "My brakes feel soft or noisy. Rank the top 3 causes for this mileage/vehicle, DIY inspections first, then parts if needed with purchase links.",
  },
  {
    id: "quick3",
    label: "Top 3 causes",
    prompt:
      "Based on my vehicle profile and what I describe next, respond with exactly: (1) top 3 likely causes ranked, (2) one DIY check per cause, (3) which Coach playbook theme fits best. Keep it safe and concise.",
  },
  {
    id: "photo",
    label: "Photo first",
    prompt:
      "I'll attach a photo of the problem area. Please analyze it, suggest Focus Mode if clear, list top 3 hypotheses, and tell me what to check next.",
  },
  {
    id: "fault-code",
    label: "Enter fault code",
    prompt:
      "I have an OBD fault code (P/C/B/U). Ask me for the exact code in one question, then confirm it, give top 3 likely causes for THIS vehicle with DIY checks, and suggest the Check Engine coach guide if relevant.",
  },
];

/** Vehicle-aware starters — prepend recommended playbook-oriented prompts. */
export function getChatStarterChips(vehicle?: VehicleInfo | null): StarterChip[] {
  const base = [...CHAT_STARTER_CHIPS];
  if (!vehicle) return base;

  const recs = listRecommendedCoachPlaybooks(vehicle, { limit: 2 });
  const vehicleChips: StarterChip[] = recs.map((r, i) => ({
    id: `coach-${r.slug}`,
    label: i === 0 ? "Guided coach for me" : "Another guided check",
    prompt: `For my ${vehicle.year} ${vehicle.make} ${vehicle.model}${
      vehicle.mileage ? ` at ${vehicle.mileage.toLocaleString()} mi` : ""
    }: start a safe DIY diagnosis aligned with the "${r.slug.replace(/_/g, " ")}" guide (${r.reason}). Give top 3 likely issues, DIY checks, and when to open that Coach playbook. Do not invent torque specs.`,
  }));

  return [...vehicleChips, ...base].slice(0, 6);
}

/** After an assistant reply — 2–3 contextual next-step chips. */
export const FOLLOW_UP_CHIPS: StarterChip[] = [
  {
    id: "top3",
    label: "Top 3 causes",
    prompt:
      "Re-rank the top 3 most likely causes for THIS vehicle given everything so far. For each: one DIY check and whether to shop or DIY-fix. Use Problem → Checks → Solution format.",
  },
  {
    id: "more-checks",
    label: "What to check next",
    prompt:
      "Based on your diagnosis, give me a short prioritized DIY checklist of what to inspect or measure next (photo / OBD / fluid / feel). Keep it safe.",
  },
  {
    id: "need-parts",
    label: "Need parts?",
    prompt:
      "Do I need parts yet? If yes, recommend fitment-aware parts with OEM/aftermarket notes and purchase links. Emit [[PARTS_DATA]] JSON when ready. If not, tell me what to verify first.",
  },
  {
    id: "check-done",
    label: "I finished that check",
    prompt:
      "I completed the check you suggested. Ask what I observed in one question, then update the Problem → Checks → Solution plan and the top 3 causes.",
  },
  {
    id: "attach-photo",
    label: "I'll send a photo",
    prompt:
      "I'm going to take a photo of the area next. Tell me the best angle to capture so you can refine the diagnosis.",
  },
  {
    id: "open-coach",
    label: "Which Coach guide?",
    prompt:
      "Name the single best Coach playbook theme/slug for this issue on my vehicle and why (1–2 sentences), then the first 3 DIY checks before starting that guided flow.",
  },
  {
    id: "fixed",
    label: "That fixed it",
    prompt:
      "The repair seems to have fixed the issue. Give a short verify / road-test checklist and what to log in maintenance history.",
  },
  {
    id: "still-broken",
    label: "Still not fixed",
    prompt:
      "I tried the steps but the problem is still there. Ask what changed, then revise the top 3 causes and next DIY checks.",
  },
];

const FOCUS_CHECK_CHIPS: Record<string, StarterChip> = {
  brakes: {
    id: "check-pads",
    label: "Check pad thickness",
    prompt:
      "Walk me through safely checking front brake pad thickness and rotor condition on this vehicle (jack stands, torque later). Problem → Checks → what thickness means for replace vs OK.",
  },
  tires: {
    id: "check-tread",
    label: "Check tread / pressure",
    prompt:
      "Guide a DIY tire tread depth and cold pressure check for this vehicle. Top 3 wear patterns and what they mean next.",
  },
  battery: {
    id: "check-battery",
    label: "Check battery / terminals",
    prompt:
      "Guide a safe battery terminal / voltage check (multimeter if I have one). Top 3 causes of no-start / dim lights and next DIY step.",
  },
  engine: {
    id: "check-fluids",
    label: "Check fluids / leaks",
    prompt:
      "Give a safe under-hood fluid and visible leak check list for this vehicle. Rank top 3 findings I might see and what to do next.",
  },
  suspension: {
    id: "check-suspension",
    label: "Bounce / visual check",
    prompt:
      "Guide a DIY bounce test and visual bushing/leak check. Top 3 suspension causes for noise/pull and safe next steps.",
  },
  ac: {
    id: "check-ac",
    label: "AC vents / clutch check",
    prompt:
      "Walk through DIY cabin AC checks (vent temp, clutch engagement if visible). Top 3 causes of weak cooling and when to stop DIY.",
  },
  hvac: {
    id: "check-cabin-filter",
    label: "Cabin filter check",
    prompt:
      "Help me inspect/replace the cabin filter if accessible on this vehicle, then list top 3 HVAC airflow causes.",
  },
  transmission: {
    id: "check-trans-fluid",
    label: "Trans fluid check",
    prompt:
      "Explain how to safely check transmission/CVT fluid on THIS vehicle only if the design allows DIY. Top 3 symptoms and shop vs DIY.",
  },
  lights: {
    id: "check-bulbs",
    label: "Bulb / fuse check",
    prompt:
      "Guide a DIY exterior light and fuse check. Top 3 causes of a dead light and next steps.",
  },
};

/**
 * Pick 3 follow-up chips: focus-specific check + top3/parts/done mix.
 */
export function getFollowUpChips(options?: {
  focusPart?: string | null;
  assistantText?: string | null;
  /** Prefer for topic inference — avoids “Brake inspection” false chips on oil DIY. */
  userText?: string | null;
}): StarterChip[] {
  const focus = (options?.focusPart || "").toLowerCase();
  const text = (options?.assistantText || "").toLowerCase();
  const user = (options?.userText || "").toLowerCase();
  const rawText = options?.assistantText || "";

  // DTC-focused replies → explain / checks / parts chips
  if (textHasDtcSignal(rawText) || textHasDtcSignal(options?.userText || "")) {
    return getDtcFollowUpChips().slice(0, 3);
  }

  const out: StarterChip[] = [];

  const inferFrom = (blob: string) => {
    const forBrakes = maskParkingBrakeMentions(blob);
    return /\bbrake\s*pads?\b|\bbrakes?\b|\bbraking\b/.test(forBrakes)
      ? FOCUS_CHECK_CHIPS.brakes
      : /\bbattery\b/.test(blob)
        ? FOCUS_CHECK_CHIPS.battery
        : /\btires?\b|\btread\b/.test(blob)
          ? FOCUS_CHECK_CHIPS.tires
          : null;
  };

  const focusChip =
    FOCUS_CHECK_CHIPS[focus] ||
    inferFrom(user) ||
    // Assistant soft-mention alone: require stronger pad/rotor wording
    (/\bbrake\s*pads?\b|\brotors?\b|\bcalipers?\b/.test(text)
      ? FOCUS_CHECK_CHIPS.brakes
      : null);

  if (focusChip) out.push(focusChip);

  const byId = (id: string) => FOLLOW_UP_CHIPS.find((c) => c.id === id)!;
  if (!out.find((c) => c.id === "top3")) out.push(byId("top3"));
  if (text.includes("part") || text.includes("replace") || text.includes("oem")) {
    out.push(byId("need-parts"));
  } else {
    out.push(byId("more-checks"));
  }
  out.push(byId("check-done"));

  // Unique, max 3
  const seen = new Set<string>();
  return out.filter((c) => {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  }).slice(0, 3);
}

export function formatMaintenanceHistoryForPrompt(
  records: MaintenanceRecord[],
  options?: {
    truncated?: boolean;
    total?: number;
    familiarityBlock?: string | null;
  },
): string {
  const familiarity =
    options?.familiarityBlock?.trim()
      ? `\n${options.familiarityBlock.trim()}\n`
      : "";

  if (!records.length) {
    return `${familiarity}## Recent maintenance history
No maintenance records saved for this vehicle yet. If the owner mentions past work, ask briefly and suggest uploading a service receipt or logging the job in History.`;
  }

  const lines = records.slice(0, 12).map((r) => {
    const miles =
      r.mileage != null ? ` · ${Number(r.mileage).toLocaleString()} mi` : "";
    const cost =
      r.costCents != null ? ` · $${(r.costCents / 100).toFixed(2)}` : "";
    const shop = r.shopName?.trim() ? ` · @ ${r.shopName.trim()}` : "";
    const parts = Array.isArray(r.partsUsed)
      ? r.partsUsed
          .map((p) => {
            if (typeof p === "string") return p;
            if (p && typeof p === "object" && "name" in p) {
              return String((p as { name: unknown }).name || "").trim();
            }
            return "";
          })
          .filter(Boolean)
          .slice(0, 6)
          .join(", ")
      : "";
    const partsBit = parts ? ` · parts: ${parts}` : "";
    const src = r.source ? ` [${r.source}]` : "";
    const desc = r.description?.trim()
      ? ` — ${r.description.trim().slice(0, 100)}`
      : r.notes?.trim()
        ? ` — ${r.notes.trim().slice(0, 100)}`
        : "";
    return `- ${r.performedAt.slice(0, 10)} · ${r.title} (${r.category})${miles}${cost}${shop}${partsBit}${src}${desc}`;
  });

  const more =
    options?.truncated && options.total
      ? `\n(${records.length} shown of ${options.total}; Free plan truncates history.)`
      : "";

  return `${familiarity}## Recent maintenance history (from garage log / receipt scans)
Use these as ground truth for THIS vehicle. Prefer citing them (date + mileage) over generic schedules.
Do NOT re-recommend jobs clearly already done unless a wear interval clearly applies (e.g. pads at 60k mi, now 72k → check wear, do not say "you still need first pads").
${lines.join("\n")}${more}`;
}

/** Drop welcome-only, trim window, and cap per-message length for API payload. */
export function trimMessagesForApi(
  messages: ChatMessage[],
  windowSize = CHAT_API_MESSAGE_WINDOW,
  options?: {
    maxContentChars?: number;
    imageHeavy?: boolean;
    /** After a hard intent reset, send only the latest user turn. */
    latestUserOnly?: boolean;
    /** Inclusive start of the post-reset window (ChatMessage.id). */
    fromMessageId?: string;
  },
): { role: string; content: string }[] {
  const maxChars = options?.maxContentChars ?? (options?.imageHeavy ? 4_000 : 6_000);
  const win = options?.imageHeavy
    ? Math.min(windowSize, 16)
    : windowSize;
  let usable = messages.filter(
    (m) =>
      m.id !== "welcome" &&
      (m.role === "user" || m.role === "assistant") &&
      Boolean(m.content?.trim()),
  );

  if (options?.latestUserOnly) {
    for (let i = usable.length - 1; i >= 0; i--) {
      if (usable[i].role === "user") {
        usable = [usable[i]];
        break;
      }
    }
  } else if (options?.fromMessageId) {
    const start = usable.findIndex((m) => m.id === options.fromMessageId);
    if (start >= 0) usable = usable.slice(start);
  }

  const sliced = usable.slice(-win);
  return sliced.map((m) => {
    const raw = m.content.trim();
    const content =
      raw.length > maxChars
        ? `${raw.slice(0, maxChars)}\n…[truncated for length]`
        : raw;
    return { role: m.role, content };
  });
}

/** Repair-loop instructions appended to system prompt. */
export const REPAIR_LOOP_PROMPT = `
## Answer structure (required for diagnosis turns)
Use this shape unless the user only asked a one-line fact:
**Problem** — 1–2 sentences on what is going wrong (grounded in THIS vehicle).
**Top 3 causes** — ranked list; each with a one-line why.
**Checks** — one safe DIY inspection per cause (photo / OBD / fluid / feel).
**Solution path** — what to do next (DIY fix vs parts vs shop), then verify steps.

## Repair loop (multi-turn continuity)
Do not restart from zero when garage profile + history already answer the question:
1. Diagnose → 2. Checks → 3. Parts/fix → 4. Verify / revise top-3.
When Retrieved Knowledge is present (especially car_fault / car_repair_qa / owner_reviews / flywheel_golden), prefer symptom → first checks → confirmed fix and cite titles briefly.
Prefer continuing the prior diagnosis over generic reset questions.
When maintenance history lists a completed job, acknowledge it and adjust intervals (e.g. "Pads replaced at 60k — at 72k inspect thickness; this is a recommended check, not a guaranteed need for new pads").
Prefer tentative language: possible cause / recommended check / general guidance — never claim a definite sole cause or guaranteed fix.
When a CONTEXT RESET block is present for this turn, do not continue the prior job.
When a [CRITICAL STATE] block is present and the issue involves brakes / parking brake: do not continue previous service steps; do not assume chocking still holds; first priority is vehicle stability or getting clear from underneath if it is moving. Do not send the user back to front jack points, drain-plug, or oil-filter steps.
`.trim();

export {
  assistantContinuesStaleFocus,
  formatStaleFocusRepairPrompt,
} from "@/lib/chat-intent-drift";
