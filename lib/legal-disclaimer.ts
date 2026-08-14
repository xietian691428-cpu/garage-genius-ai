/**
 * Unified vehicle liability disclaimer + soft-language / high-risk helpers.
 * Keep product copy here so Chat, Coach, OBD, and Settings stay aligned.
 */

import type {
  CoachRiskConfirm,
  CoachScenarioStep,
} from "@/lib/types/coach-scenario";

/** Canonical EN disclaimer (also mirrored in i18n `legal.disclaimer`). */
export const LEGAL_DISCLAIMER_EN =
  "This is general guidance only. Always refer to your vehicle’s official owner’s manual or consult a qualified technician. Garage Genius AI is not responsible for any damage, injury, or costs resulting from DIY actions or reliance on this information.";

/** Canonical ES disclaimer (mirrored in i18n). */
export const LEGAL_DISCLAIMER_ES =
  "Esta es solo una orientación general. Consulte siempre el manual oficial del propietario de su vehículo o a un técnico cualificado. Garage Genius AI no se responsabiliza de ningún daño, lesión o costo derivado de acciones DIY o de confiar en esta información.";

/** Canonical ZH disclaimer (Chat AI append fallback; UI i18n stays en/es). */
export const LEGAL_DISCLAIMER_ZH =
  "这仅为一般性参考指引。请务必以车辆官方用户手册为准，或咨询合格技师。因 DIY 操作或依赖本信息而导致的任何损坏、伤害或费用，Garage Genius AI 概不负责。";

/** Substring used by ensureDisclaimer / strip helpers (stable across revisions). */
export const LEGAL_DISCLAIMER_MARKER =
  "Garage Genius AI is not responsible for any damage, injury, or costs";

export const LEGAL_RISK_CHECKBOX_EN =
  "I have read and understand the risks";

export const LEGAL_FIND_SHOP_EN = "Find a nearby shop";

/** Soft-language rules injected into AI system prompts. */
export const LEGAL_SOFT_LANGUAGE_PROMPT = `
## Legal / safety language (required — every reply language)
- Never claim a guaranteed fix or a single definite root cause.
- Prefer: "possible cause", "recommended check", "general guidance", "may indicate" (or the equivalent soft phrasing in the reply language).
- Forbidden phrasing (and close translations): "guaranteed to fix", "this will definitely fix", "this is definitely the cause", "100% certain", "must be X", "Replace X now" as a root-cause order, Chinese equivalents like "一定是…", "保证修好", "马上更换…" as definitive commands.
- Always leave room for OEM manual verification and a qualified technician.
- Remind the owner that DIY carries risk of damage, injury, or extra cost.
- Never assert that an insurer will or will not cover a claim.
`.trim();

/** Canonical EN insurance disclaimer (mirrored in i18n `legal.insurance.disclaimer`). */
export const LEGAL_INSURANCE_DISCLAIMER_EN =
  "Modifications or non-OEM parts can affect insurance coverage. Rules vary by country, state, and insurer. This is general information only — always check your policy or contact your insurer before modifying your vehicle. Garage Genius AI does not provide insurance or legal advice.";

/** Canonical ES insurance disclaimer (mirrored in i18n). */
export const LEGAL_INSURANCE_DISCLAIMER_ES =
  "Las modificaciones o piezas que no sean del fabricante original pueden afectar la cobertura del seguro. Las normas varían según el país, el estado y la aseguradora. Esta es información general: consulte siempre su póliza o contacte a su aseguradora antes de modificar el vehículo. Garage Genius AI no ofrece asesoramiento de seguros ni legal.";

const HIGH_RISK_PATTERN =
  /\b(brake|brakes|rotor|caliper|jack|jacking|lift|hoist|stands?|battery|airbag|srs|high[\s-]?voltage|hv\b|ev battery|under\s+the\s+(car|vehicle)|fuel\s+rail|fuel\s+line|strut\s+spring|coil\s+spring|compression|hot\s+coolant|radiator\s+cap|exhaust\s+manifold|timing\s+belt|clutch)\b/i;

/**
 * Detect high-risk coach steps so we can force a risk_confirm gate
 * even when playbook JSON left risk_confirm null.
 */
export function isHighRiskCoachStep(
  step: Pick<
    CoachScenarioStep,
    "title" | "description" | "safety_warning" | "focus_part" | "is_operational"
  >,
): boolean {
  if (step.focus_part === "brakes" || step.focus_part === "battery") {
    return true;
  }
  const blob = [
    step.title,
    step.description,
    step.safety_warning || "",
  ].join("\n");
  return HIGH_RISK_PATTERN.test(blob);
}

export function buildDefaultHighRiskConfirm(labels: {
  title: string;
  body: string;
  checkbox: string;
  confirm: string;
  cancel: string;
  disclaimer: string;
}): CoachRiskConfirm {
  return {
    required: true,
    title: labels.title,
    body: labels.body,
    checkbox_label: labels.checkbox,
    confirm_label: labels.confirm,
    cancel_label: labels.cancel,
    cancel_action: "book_shop",
    risk_level: "high",
    disclaimer: labels.disclaimer,
  };
}

/** Normalize playbook risk_confirm with unified disclaimer / shop cancel labels. */
export function resolveCoachRiskConfirm(
  step: CoachScenarioStep,
  enforceModal: boolean,
  labels: {
    disclaimer: string;
    checkbox: string;
    cancel: string;
    highRiskTitle: string;
    highRiskBody: string;
    continueLabel: string;
  },
): CoachRiskConfirm | null {
  if (step.risk_confirm?.required) {
    return {
      ...step.risk_confirm,
      checkbox_label:
        step.risk_confirm.checkbox_label?.trim() || labels.checkbox,
      cancel_label: step.risk_confirm.cancel_label?.trim() || labels.cancel,
      cancel_action: "book_shop",
      disclaimer:
        step.risk_confirm.disclaimer?.trim() || labels.disclaimer,
    };
  }

  if (enforceModal && isHighRiskCoachStep(step)) {
    return buildDefaultHighRiskConfirm({
      title: labels.highRiskTitle,
      body: labels.highRiskBody,
      checkbox: labels.checkbox,
      confirm: labels.continueLabel,
      cancel: labels.cancel,
      disclaimer: labels.disclaimer,
    });
  }

  return null;
}

const KNOWN_DISCLAIMER_FRAGMENTS = [
  LEGAL_DISCLAIMER_MARKER,
  "Not professional mechanic advice",
  "This is AI-generated information for reference only",
  "This is general guidance only",
  "This app isn't liable for DIY damage",
  "This app is not responsible for damage from DIY work",
  "Garage Genius AI no se responsabiliza",
  "Garage Genius AI 概不负责",
  "这仅为一般性参考指引",
];

/** True if content already ends with (or contains) a liability disclaimer. */
export function contentHasLegalDisclaimer(content: string): boolean {
  return KNOWN_DISCLAIMER_FRAGMENTS.some((f) => content.includes(f));
}

/** Append a liability disclaimer when missing (language follows optional hint). */
export function ensureLegalDisclaimer(
  content: string,
  replyLanguage: "zh" | "es" | "en" = "en",
): string {
  if (contentHasLegalDisclaimer(content)) return content;
  const disclaimer =
    replyLanguage === "zh"
      ? LEGAL_DISCLAIMER_ZH
      : replyLanguage === "es"
        ? LEGAL_DISCLAIMER_ES
        : LEGAL_DISCLAIMER_EN;
  return `${content.trim()}\n\n${disclaimer}`;
}

/** Remove trailing disclaimer block so UI can show a single footer. */
export function stripTrailingLegalDisclaimer(content: string): string {
  let out = content.trimEnd();
  for (const frag of KNOWN_DISCLAIMER_FRAGMENTS) {
    const idx = out.lastIndexOf(frag);
    if (idx < 0) continue;
    // Only strip if the fragment is in the last ~500 chars (footer territory)
    if (out.length - idx > 500) continue;
    // Walk back to previous paragraph break
    let start = idx;
    while (start > 0 && out[start - 1] === "\n") start -= 1;
    // Include leading warning emoji / dashes on same paragraph
    const lineStart = out.lastIndexOf("\n", idx);
    const paragraphStart = lineStart >= 0 ? lineStart + 1 : 0;
    // Prefer cutting from a blank-line boundary before the disclaimer
    const blank = out.lastIndexOf("\n\n", idx);
    const cut =
      blank >= 0 && blank >= out.length - 600 ? blank : paragraphStart;
    out = out.slice(0, cut).trimEnd();
    break;
  }
  return out;
}
