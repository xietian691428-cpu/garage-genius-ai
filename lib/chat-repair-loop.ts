/**
 * DIY chat repair loop helpers — diagnosis → checks → parts → verify.
 * Does not touch CoachScenarioPlayer / playbook JSON.
 */

import type { ChatMessage, VehicleInfo } from "@/lib/types/chat";
import type { MaintenanceRecord } from "@/lib/types/maintenance";
import { listRecommendedCoachPlaybooks } from "@/lib/coach-scenarios/catalog";

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

/** After an assistant reply — invite the next stage of the repair loop. */
export const FOLLOW_UP_CHIPS: StarterChip[] = [
  {
    id: "top3",
    label: "Rank top 3 causes",
    prompt:
      "Re-rank the top 3 most likely causes for THIS vehicle given everything so far. For each: one DIY check and whether to shop or DIY-fix. Use Problem → Checks → Solution format.",
  },
  {
    id: "more-checks",
    label: "What should I check next?",
    prompt:
      "Based on your diagnosis, give me a short prioritized DIY checklist of what to inspect or measure next (photo / OBD / fluid / mileage). Keep it safe.",
  },
  {
    id: "need-parts",
    label: "Recommend parts to buy",
    prompt:
      "Recommend the parts I likely need for this vehicle, with OEM/aftermarket notes and purchase links. Emit [[PARTS_DATA]] JSON when ready.",
  },
  {
    id: "attach-photo",
    label: "I'll send a photo",
    prompt:
      "I'm going to take a photo of the area next. Tell me the best angle to capture so you can refine the diagnosis.",
  },
  {
    id: "open-coach",
    label: "Which Coach guide fits?",
    prompt:
      "Name the single best Coach playbook theme/slug for this issue on my vehicle and why (1–2 sentences), then the first 3 DIY checks I should do before starting that guided flow.",
  },
  {
    id: "fixed",
    label: "That fixed it",
    prompt:
      "The repair seems to have fixed the issue. Please help me verify with a short road-test / recheck checklist, and suggest what to log in maintenance history.",
  },
  {
    id: "still-broken",
    label: "Still not fixed",
    prompt:
      "I tried the steps but the problem is still there. Ask what changed, then revise the top 3 causes and next DIY checks.",
  },
];

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
## Repair loop (keep multi-turn continuity)
Drive a clear DIY loop across turns — do not restart from zero when the garage profile + history already answer the question:
1. **Diagnose** — short assessment + **top 3 likely causes ranked** for THIS vehicle (mileage/make/model matter); ask only 1–2 clarifying questions when needed.
2. **Checks** — for each likely cause, one safe DIY inspection (photo / OBD / fluid / feel). Prefer "Problem → Checks → Solution" structure over a wall of text.
3. **Parts / fix** — when ready, recommend fitment-aware parts + purchase links and emit [[PARTS_DATA]] … [[/PARTS_DATA]].
4. **Verify** — after the owner tries a fix, offer a recheck / road-test checklist; if unresolved, revise the top-3 plan.
When Retrieved Knowledge is present, prefer paths that look like: symptom → first checks → confirmed fix (especially car_fault / car_repair_qa / flywheel_golden hits). Cite titles briefly.
Always ground advice in the Vehicle Health Profile, Authoritative Configuration, and Recent maintenance history when present.
Prefer continuing the prior diagnosis over generic reset questions.
`.trim();
