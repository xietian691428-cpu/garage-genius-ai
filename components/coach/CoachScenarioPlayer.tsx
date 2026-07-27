"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  ChevronLeft,
  ExternalLink,
  Shield,
  Store,
} from "lucide-react";
import type { CoachActionButton, CoachScenario } from "@/lib/types/coach-scenario";
import {
  applyStepVariants,
  buildTokenContext,
  injectTokens,
  matchAdaptiveRules,
  type CoachVehicleContext,
} from "@/lib/coach-scenarios/runtime";
import { resolveCoachRiskConfirm } from "@/lib/legal-disclaimer";
import LiabilityDisclaimer from "@/components/legal/LiabilityDisclaimer";
import CoachStepFeedback, {
  postCoachStepFeedback,
} from "@/components/coach/CoachStepFeedback";
import CoachAdoptKnowledgeButton from "@/components/coach/CoachAdoptKnowledgeButton";
import type { CoachStepFeedbackVote } from "@/lib/types/coach-scenario";

type Props = {
  scenario: CoachScenario;
  vehicle: CoachVehicleContext;
  onClose: () => void;
  onOpenChat?: (prompt: string) => void;
  onOpenParts?: (payload?: string) => void;
  onOpenShop?: () => void;
  onLogMaintenance?: (category: string) => void;
};

function sessionId() {
  if (typeof window === "undefined") return "ssr";
  const key = "gg_coach_session";
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(key, id);
  }
  return id;
}

export default function CoachScenarioPlayer({
  scenario,
  vehicle,
  onClose,
  onOpenChat,
  onOpenParts,
  onOpenShop,
  onLogMaintenance,
}: Props) {
  const { t } = useTranslation();
  const [stepId, setStepId] = useState(
    scenario.entry_step_id || scenario.steps[0]?.id,
  );
  const [flags, setFlags] = useState<Record<string, unknown>>({});
  const [riskOpen, setRiskOpen] = useState(false);
  const [riskChecked, setRiskChecked] = useState(false);
  const [pendingBtn, setPendingBtn] = useState<CoachActionButton | null>(null);
  const [completed, setCompleted] = useState(false);
  const [feedbackKey, setFeedbackKey] = useState(0);
  /** Last yes/no on this step — seeds quality_score when adopting to KB */
  const [lastVote, setLastVote] = useState<CoachStepFeedbackVote | null>(null);

  const rawStep = useMemo(
    () => scenario.steps.find((s) => s.id === stepId) ?? scenario.steps[0],
    [scenario.steps, stepId],
  );
  const step = useMemo(
    () => applyStepVariants(rawStep, vehicle),
    [rawStep, vehicle],
  );
  const effectiveRisk = useMemo(
    () =>
      resolveCoachRiskConfirm(
        step,
        Boolean(scenario.ux_rules?.enforce_risk_confirm_modal),
        {
          disclaimer: t("legal.disclaimer"),
          checkbox: t("legal.riskCheckbox"),
          cancel: t("legal.findShop"),
          highRiskTitle: t("legal.highRiskTitle"),
          highRiskBody: t("legal.highRiskBody"),
          continueLabel: t("legal.continueAnyway"),
        },
      ),
    [step, scenario.ux_rules?.enforce_risk_confirm_modal, t],
  );
  const asset = scenario.visual_assets.find((a) => a.key === step.visual_asset_key);
  const rules = matchAdaptiveRules(scenario.adaptive_rules, vehicle);
  const ctx = buildTokenContext(scenario, vehicle);
  const maxBtns = scenario.ux_rules?.max_action_buttons ?? 2;
  const buttons = (step.action_buttons || []).slice(0, maxBtns);
  const percent =
    step.progress?.percent ?? Math.round((step.progress?.fraction || 0) * 100);
  const showFeedback = scenario.ux_rules?.show_step_feedback !== false;
  const feedbackPrompt =
    scenario.ux_rules?.step_feedback_prompt || "Was this step useful?";

  useEffect(() => {
    setFeedbackKey((k) => k + 1);
    setLastVote(null);
    setRiskOpen(false);
    setPendingBtn(null);
    setRiskChecked(false);
  }, [stepId]);

  function runAction(btn: CoachActionButton) {
    if (btn.set_flags) setFlags((f) => ({ ...f, ...btn.set_flags }));
    switch (btn.action) {
      case "goto":
      case "skip_to":
        setStepId(btn.next_step_id || btn.payload || stepId);
        break;
      case "book_shop":
        onOpenShop?.();
        break;
      case "open_chat":
        onOpenChat?.(btn.payload || "");
        break;
      case "open_parts":
        onOpenParts?.(btn.payload);
        break;
      case "log_maintenance":
        onLogMaintenance?.(btn.payload || scenario.completion.log_category);
        setCompleted(true);
        break;
      case "mark_done":
        setCompleted(true);
        break;
      case "take_photo":
        onOpenChat?.(
          btn.payload ||
            "I took a photo for this coach step. Please review it with my vehicle context.",
        );
        break;
      case "show_video":
        break;
      default:
        break;
    }
  }

  function onPress(btn: CoachActionButton) {
    const needsRisk =
      effectiveRisk?.required &&
      (btn.style === "primary" || btn.action === "goto") &&
      !flags[`risk_ack_${step.id}`];

    if (needsRisk) {
      setPendingBtn(btn);
      setRiskChecked(false);
      setRiskOpen(true);
      return;
    }
    runAction(btn);
  }

  function confirmRisk() {
    if (!riskChecked || !pendingBtn) return;
    setFlags((f) => ({ ...f, [`risk_ack_${step.id}`]: true }));
    setRiskOpen(false);
    const btn = pendingBtn;
    setPendingBtn(null);
    runAction(btn);
  }

  if (completed) {
    const completionDesc = injectTokens(scenario.completion.description, ctx);
    const lastStepBlurb = [
      step.title,
      injectTokens(step.description, ctx),
      step.safety_warning,
      step.trust_nudge,
    ]
      .filter(Boolean)
      .join("\n\n");
    return (
      <div className="flex h-full min-h-0 flex-col overflow-y-auto bg-[#0a0f1c] px-4 py-6">
        <div className="mx-auto w-full max-w-lg space-y-4">
          <h2 className="text-2xl font-bold text-white">
            {scenario.completion.title}
          </h2>
          {scenario.completion.coach_encourage && (
            <p className="text-sm text-cyan-300/90">
              {scenario.completion.coach_encourage}
            </p>
          )}
          <p className="text-sm leading-relaxed text-slate-300">
            {completionDesc}
          </p>
          <CoachAdoptKnowledgeButton
            variant="completion"
            payload={{
              scenario_slug: scenario.slug,
              scenario_id: scenario.id,
              step_id: step.id,
              title: scenario.completion.title,
              description: `${completionDesc}\n\n---\nLast step checks / solution:\n${lastStepBlurb}`,
              coach_encourage: scenario.completion.coach_encourage ?? null,
              kind: "completion",
              last_vote: lastVote,
              vehicle_make: vehicle.make ?? null,
              vehicle_model: vehicle.model ?? null,
            }}
          />
          <div className="flex flex-col gap-2 pt-2">
            {(scenario.completion.action_buttons || []).slice(0, 2).map((btn) => (
              <button
                key={btn.id}
                type="button"
                onClick={() => {
                  if (btn.action === "mark_done") onClose();
                  else if (btn.action === "open_chat") onOpenChat?.(btn.payload || "");
                  else if (btn.action === "book_shop") onOpenShop?.();
                  else onClose();
                }}
                className={`rounded-2xl px-4 py-3.5 text-sm font-semibold ${
                  btn.style === "primary"
                    ? "bg-cyan-500 text-black"
                    : "border border-slate-700 text-slate-200"
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#0a0f1c]">
      <div className="flex shrink-0 items-center gap-2 border-b border-slate-800 px-3 py-2.5">
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl p-2 text-slate-400 hover:bg-slate-900 hover:text-white"
          aria-label="Back to guides"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-cyan-400">
            Garage Genius Coach
          </p>
          <p className="truncate text-sm text-slate-200">
            {step.progress?.label || `${percent}% complete`}
          </p>
        </div>
      </div>

      {scenario.ux_rules?.show_progress_bar !== false && (
        <div className="h-1 w-full bg-slate-900">
          <div
            className="h-full bg-cyan-400 transition-all"
            style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
          />
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-lg">
          {/* Visual-first media */}
          <div className="relative aspect-[16/10] w-full overflow-hidden bg-slate-900">
            {asset?.src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={asset.poster || asset.src}
                alt={asset.alt || step.title}
                className="h-full w-full object-cover opacity-90"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-slate-600">
                <Shield className="h-12 w-12" />
              </div>
            )}
            <div className="absolute bottom-2 left-2 rounded-lg bg-black/55 px-2 py-1 text-[10px] uppercase tracking-wide text-slate-300">
              {step.visual_type}
            </div>
          </div>

          <div className="space-y-3 px-4 py-4">
            <h2 className="text-xl font-bold text-white">{step.title}</h2>
            {step.coach_encourage && (
              <p className="text-sm text-amber-200/90">{step.coach_encourage}</p>
            )}
            {step.personalize && (
              <p className="text-sm text-slate-400">
                {injectTokens(step.personalize, ctx)}
              </p>
            )}
            <p className="text-sm leading-relaxed text-slate-200">
              {injectTokens(step.description, ctx)}
            </p>
            {rules[0]?.coach_note && (
              <p className="rounded-xl border border-slate-800 bg-slate-900/50 px-3 py-2 text-xs text-slate-400">
                {rules[0].coach_note}
              </p>
            )}
            {step.trust_nudge && (
              <p className="flex gap-2 rounded-xl border border-slate-700/80 bg-slate-900/40 px-3 py-2 text-xs text-slate-300">
                <Shield className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                {step.trust_nudge}
              </p>
            )}
            {step.safety_warning && (
              <p className="flex gap-2 rounded-xl border border-amber-700/40 bg-amber-950/30 px-3 py-2 text-xs text-amber-100">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                {step.safety_warning}
              </p>
            )}

            <div className="flex flex-col gap-2 pt-1">
              {buttons.map((btn) => (
                <button
                  key={btn.id}
                  type="button"
                  onClick={() => onPress(btn)}
                  className={`rounded-2xl px-4 py-3.5 text-sm font-semibold transition ${
                    btn.style === "primary"
                      ? "bg-cyan-500 text-black hover:bg-cyan-400"
                      : btn.style === "danger"
                        ? "border border-red-500/50 bg-red-950/40 text-red-200 hover:bg-red-950/60"
                        : "border border-slate-700 text-slate-200 hover:bg-slate-900"
                  }`}
                >
                  {btn.label}
                </button>
              ))}
            </div>

            {showFeedback && (
              <div className="pt-1" key={feedbackKey}>
                <CoachStepFeedback
                  prompt={feedbackPrompt}
                  onVote={async (vote, note) => {
                    setLastVote(vote);
                    return postCoachStepFeedback({
                      scenario_slug: scenario.slug,
                      scenario_id: scenario.id,
                      step_id: step.id,
                      vote,
                      note,
                      vehicle_mileage: vehicle.mileage,
                      vehicle_make: vehicle.make,
                      vehicle_model: vehicle.model,
                      client_session_id: sessionId(),
                    });
                  }}
                />
              </div>
            )}

            <CoachAdoptKnowledgeButton
              variant="step"
              payload={{
                scenario_slug: scenario.slug,
                scenario_id: scenario.id,
                step_id: step.id,
                title: step.title,
                description: injectTokens(step.description, ctx),
                coach_encourage: step.coach_encourage ?? null,
                safety_warning: step.safety_warning ?? null,
                trust_nudge: step.trust_nudge ?? null,
                personalize: step.personalize
                  ? injectTokens(step.personalize, ctx)
                  : null,
                kind: "step",
                last_vote: lastVote,
                vehicle_make: vehicle.make ?? null,
                vehicle_model: vehicle.model ?? null,
              }}
            />

            <LiabilityDisclaimer variant="inline" className="pb-6 pt-2" />
          </div>
        </div>
      </div>

      {riskOpen && effectiveRisk && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-[#0f1524] p-5 shadow-xl">
            <h3 className="text-lg font-bold text-white">
              {effectiveRisk.title}
            </h3>
            <p className="mt-2 text-sm text-slate-300">{effectiveRisk.body}</p>
            <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
              {effectiveRisk.disclaimer || t("legal.disclaimer")}
            </p>
            <label className="mt-4 flex cursor-pointer items-start gap-2 rounded-xl border border-slate-700 bg-slate-900/50 px-3 py-3">
              <input
                type="checkbox"
                checked={riskChecked}
                onChange={(e) => setRiskChecked(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-600"
              />
              <span className="text-sm text-slate-200">
                {effectiveRisk.checkbox_label}
              </span>
            </label>
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                disabled={!riskChecked}
                onClick={confirmRisk}
                className="rounded-2xl bg-cyan-500 px-4 py-3 text-sm font-semibold text-black disabled:opacity-40"
              >
                {effectiveRisk.confirm_label}
              </button>
              <button
                type="button"
                onClick={() => {
                  setRiskOpen(false);
                  setPendingBtn(null);
                  onOpenShop?.();
                }}
                className="flex items-center justify-center gap-2 rounded-2xl border border-slate-600 px-4 py-3 text-sm font-medium text-slate-200"
              >
                <Store className="h-4 w-4" />
                {effectiveRisk.cancel_label || t("legal.findShop")}
                <ExternalLink className="h-3.5 w-3.5 opacity-60" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
