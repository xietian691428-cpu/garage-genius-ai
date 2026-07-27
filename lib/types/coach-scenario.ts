/**
 * Coach scenario interactive flows — multi-step DIY coaching (oil, brakes, tires, …).
 * Prefer `*_production.json` (English, US/EU) in the player.
 */

export type CoachVisualType = "image" | "gif" | "video" | "illustration" | "annotated" | "none";

/** Short EN disclaimer — every step in production playbooks */
export const COACH_SAFETY_DISCLAIMER_EN =
  "General guidance only. Follow your owner's manual or an authorized tech. This app isn't liable for DIY damage.";

/** Longer EN disclaimer inside risk_confirm modals */
export const COACH_SAFETY_DISCLAIMER_EN_FULL =
  "This is general guidance only. Always follow your owner's manual or an authorized technician. This app is not responsible for damage from DIY work.";

export const COACH_RISK_CHECKBOX_EN = "I have read and understand the risks";
export const COACH_FIND_SHOP_LABEL_EN = "Find a nearby shop";

export type CoachActionButton = {
  id: string;
  label: string;
  style: "primary" | "secondary" | "ghost" | "danger";
  action:
    | "next_step"
    | "prev_step"
    | "skip_to"
    | "goto"
    | "open_chat"
    | "open_parts"
    | "open_focus"
    | "mark_done"
    | "log_maintenance"
    | "book_shop"
    | "show_video"
    | "take_photo"
    | "custom";
  payload?: string;
  next_step_id?: string;
  set_flags?: Record<string, string | boolean | number>;
};

export type CoachAdaptiveWhen = {
  mileage_min?: number;
  mileage_max?: number;
  engine_includes?: string[];
  powertrain?: Array<"gas" | "hybrid" | "phev" | "diesel" | "bev">;
  markets?: Array<"US" | "EU" | "GB" | "CA">;
  brand_includes?: string[];
  model_includes?: string[];
  flags?: Record<string, string | boolean | number>;
};

export type CoachStepVariant = {
  when: CoachAdaptiveWhen;
  title?: string;
  description?: string;
  coach_encourage?: string;
  personalize?: string;
  safety_warning?: string | null;
  visual_asset_key?: string;
};

export type CoachStepProgress = {
  index: number;
  total: number;
  label?: string;
  fraction?: number;
  /** 0–100 for UI ("You're about 60% through") */
  percent?: number;
};

export type CoachRiskConfirm = {
  required: true;
  title: string;
  body: string;
  checkbox_label: string;
  confirm_label: string;
  /** Always "Find a nearby shop" in production */
  cancel_label: string;
  cancel_action: "book_shop";
  risk_level: "high" | "critical";
  /** Full EN disclaimer shown inside the modal */
  disclaimer?: string;
};

export type CoachScenarioStep = {
  id: string;
  title: string;
  description: string;
  coach_encourage?: string;
  /**
   * Tokens: {{year}} {{make}} {{model}} {{mileage}} {{name}} {{next_service}}
   * ({{next_service_miles}} accepted as alias of {{next_service}})
   */
  personalize?: string;
  visual_type: CoachVisualType;
  visual_asset_key?: string;
  visual_prompt?: string;
  action_buttons: CoachActionButton[];
  safety_warning?: string | null;
  /** Required on every production step (short EN) */
  safety_disclaimer: string;
  is_operational?: boolean;
  risk_confirm?: CoachRiskConfirm | null;
  trust_nudge?: string | null;
  progress?: CoachStepProgress;
  duration_minutes?: number;
  tools?: string[];
  difficulty?: "Easy" | "Medium" | "Hard";
  variants?: CoachStepVariant[];
  focus_part?:
    | "engine"
    | "brakes"
    | "suspension"
    | "battery"
    | "tires"
    | "hvac"
    | "transmission"
    | "lights";
  branches?: Array<{
    when_button_id: string;
    goto: string;
    note?: string;
  }>;
};

export type CoachVisualAsset = {
  key: string;
  type: CoachVisualType;
  src: string;
  poster?: string;
  alt: string;
  shot_description: string;
};

export type CoachAdaptiveRule = {
  id: string;
  when: CoachAdaptiveWhen;
  coach_note: string;
  interval_miles?: number;
  prefer_shop?: boolean;
  oil_spec_hint?: string;
};

export type CoachUxRules = {
  max_action_buttons: 2;
  prefer_visual: CoachVisualType[];
  trust_reminder_every_n_steps: number;
  trust_reminder_default: string;
  show_progress_bar: boolean;
  require_safety_disclaimer_on_operational: boolean;
  require_safety_disclaimer_every_step?: boolean;
  enforce_risk_confirm_modal: boolean;
  safety_disclaimer_default: string;
  safety_disclaimer_modal?: string;
  risk_checkbox_label_default: string;
  risk_cancel_label_default?: string;
  risk_cancel_action_default?: "book_shop";
  locale?: "en-US";
  /** Show “Was this step useful?” after actions (production default true) */
  show_step_feedback?: boolean;
  step_feedback_prompt?: string;
};

/** Per-step usefulness vote for continuous iteration */
export type CoachStepFeedbackVote = "yes" | "no";

export type CoachStepFeedbackPayload = {
  scenario_slug: string;
  scenario_id: string;
  step_id: string;
  vote: CoachStepFeedbackVote;
  vehicle_mileage?: number;
  vehicle_make?: string;
  vehicle_model?: string;
  note?: string;
  client_session_id?: string;
};

/** Adopt Coach step / completion into knowledge_base (RAG write path). */
export type CoachAdoptKnowledgeRequest = {
  scenario_slug: string;
  scenario_id: string;
  step_id: string;
  title: string;
  description: string;
  coach_encourage?: string | null;
  safety_warning?: string | null;
  trust_nudge?: string | null;
  personalize?: string | null;
  kind?: "step" | "completion";
  /** 1–5; if omitted, derived from last_vote */
  quality_score?: number;
  last_vote?: CoachStepFeedbackVote | null;
  vehicle_make?: string | null;
  vehicle_model?: string | null;
  vehicle_years?: string | null;
};

export type CoachAdoptKnowledgeResponse = {
  ok: boolean;
  knowledgeId: string;
  ingestKey: string;
  embedded: boolean;
  qualityScore: number;
  error?: string;
  code?: string;
};

export type CoachScenario = {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  category: "maintenance" | "safety" | "diagnosis";
  focus_part: CoachScenarioStep["focus_part"];
  version?: "production" | "final" | "optimized" | "baseline";
  locale?: "en-US";
  markets?: Array<"US" | "EU" | "GB" | "CA">;
  estimated_total_minutes: { diy_min: number; diy_max: number; shop_min: number; shop_max: number };
  cost_band_usd: { diy_min: number; diy_max: number; shop_min: number; shop_max: number };
  tone: string;
  ux_rules?: CoachUxRules;
  entry_step_id?: string;
  prerequisites: string[];
  tools_checklist: string[];
  parts_checklist: string[];
  adaptive_rules: CoachAdaptiveRule[];
  visual_assets: CoachVisualAsset[];
  steps: CoachScenarioStep[];
  completion: {
    title: string;
    description: string;
    coach_encourage?: string;
    log_category:
      | "oil"
      | "brakes"
      | "tires"
      | "battery"
      | "diagnostics"
      | "hvac"
      | "ev_charging"
      | "seasonal"
      | "transmission"
      | "road_trip"
      | "high_mileage"
      | "used_car"
      | "luxury"
      | "alignment"
      | "suspension"
      | "exhaust"
      | "fuel"
      | "cooling"
      | "electrical"
      | "body"
      | "seasonal_summer"
      | "modified"
      | "towing"
      | "offroad"
      | "classic"
      | "insurance"
      | "other";
    next_check_miles_default: number;
    action_buttons: CoachActionButton[];
  };
  ui_spec: {
    figma: string;
    react_native_pseudocode: string;
  };
};
