/**
 * DIY chat repair loop helpers — diagnosis → checks → parts → verify.
 * Does not touch CoachScenarioPlayer / playbook JSON.
 */

import type { ChatMessage } from "@/lib/types/chat";
import type { MaintenanceRecord } from "@/lib/types/maintenance";

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
      "I'm hearing an unusual noise while driving. Help me diagnose it with a short checklist of questions, then DIY checks I can do safely.",
  },
  {
    id: "light",
    label: "Warning light",
    prompt:
      "A warning light came on. Ask what color/symbol I see, then walk me through safe DIY checks before I spend money on parts.",
  },
  {
    id: "brake",
    label: "Brake feel",
    prompt:
      "My brakes feel soft or noisy. Guide me through diagnosis, what to inspect, and parts I may need with purchase links.",
  },
  {
    id: "photo",
    label: "Photo first",
    prompt:
      "I'll attach a photo of the problem area. Please analyze it, suggest Focus Mode if clear, and tell me what to check next.",
  },
];

/** After an assistant reply — invite the next stage of the repair loop. */
export const FOLLOW_UP_CHIPS: StarterChip[] = [
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
    id: "fixed",
    label: "That fixed it",
    prompt:
      "The repair seems to have fixed the issue. Please help me verify with a short road-test / recheck checklist, and suggest what to log in maintenance history.",
  },
  {
    id: "still-broken",
    label: "Still not fixed",
    prompt:
      "I tried the steps but the problem is still there. Ask what changed, then revise the diagnosis and next DIY checks.",
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
1. **Diagnose** — short assessment + top likely causes; ask only 1–2 clarifying questions when needed.
2. **Supplement checks** — invite photo / OBD / fluid / mileage checks; list safe DIY inspections before parts.
3. **Parts** — when ready, recommend fitment-aware parts + purchase links and emit [[PARTS_DATA]] … [[/PARTS_DATA]].
4. **Verify** — after the owner tries a fix, offer a recheck / road-test checklist; if unresolved, revise the plan.
Always ground advice in the Vehicle Health Profile, Authoritative Configuration, and Recent maintenance history when present.
Prefer continuing the prior diagnosis over generic reset questions.
`.trim();
