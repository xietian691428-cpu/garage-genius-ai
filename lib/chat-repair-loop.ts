/**
 * DIY chat repair loop helpers — diagnosis → checks → parts → verify.
 * Does not touch CoachScenarioPlayer / playbook JSON.
 */

import type { ChatMessage, VehicleInfo } from "@/lib/types/chat";
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
}): StarterChip[] {
  const focus = (options?.focusPart || "").toLowerCase();
  const text = (options?.assistantText || "").toLowerCase();
  const rawText = options?.assistantText || "";

  // DTC-focused replies → explain / checks / parts chips
  if (textHasDtcSignal(rawText)) {
    return getDtcFollowUpChips().slice(0, 3);
  }

  const out: StarterChip[] = [];

  const focusChip =
    FOCUS_CHECK_CHIPS[focus] ||
    (text.includes("brake")
      ? FOCUS_CHECK_CHIPS.brakes
      : text.includes("battery")
        ? FOCUS_CHECK_CHIPS.battery
        : text.includes("tire")
          ? FOCUS_CHECK_CHIPS.tires
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
  options?: { truncated?: boolean; total?: number },
): string {
  if (!records.length) {
    return `## Recent maintenance history
No maintenance records saved for this vehicle yet. If the owner mentions past work, ask briefly and proceed.`;
  }

  const lines = records.slice(0, 8).map((r) => {
    const miles =
      r.mileage != null ? ` · ${Number(r.mileage).toLocaleString()} mi` : "";
    const cost =
      r.costCents != null ? ` · $${(r.costCents / 100).toFixed(2)}` : "";
    const desc = r.description?.trim()
      ? ` — ${r.description.trim().slice(0, 120)}`
      : "";
    return `- ${r.performedAt.slice(0, 10)} · ${r.title} (${r.category})${miles}${cost}${desc}`;
  });

  const more =
    options?.truncated && options.total
      ? `\n(${records.length} shown of ${options.total}; Free plan truncates history.)`
      : "";

  return `## Recent maintenance history (from garage log)
Use this as context for multi-turn coaching. Prefer not re-asking for jobs already logged.
${lines.join("\n")}${more}`;
}

/** Drop welcome-only and trim to a recent window for API payload. */
export function trimMessagesForApi(
  messages: ChatMessage[],
  windowSize = CHAT_API_MESSAGE_WINDOW,
): { role: string; content: string }[] {
  const usable = messages.filter(
    (m) =>
      m.id !== "welcome" &&
      (m.role === "user" || m.role === "assistant") &&
      Boolean(m.content?.trim()),
  );
  const sliced = usable.slice(-windowSize);
  return sliced.map((m) => ({ role: m.role, content: m.content }));
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
`.trim();
