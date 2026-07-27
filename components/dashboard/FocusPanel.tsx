"use client";

import { useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  Mic,
  ShieldAlert,
  Volume2,
  Wrench,
  X,
} from "lucide-react";
import type { DashboardRegion } from "@/lib/types/dashboard";
import type { FocusCommand } from "@/lib/types/focus";
import {
  buildFocusSafety,
  buildFocusSteps,
  buildFocusTools,
} from "@/lib/parse-ai-focus";
import {
  isSpeechSynthesisSupported,
  speakText,
  stopSpeaking,
} from "@/lib/browser-voice";
import { useBodyScrollLock } from "@/lib/hooks/useBodyScrollLock";
import LiabilityDisclaimer from "@/components/legal/LiabilityDisclaimer";

type FocusPanelProps = {
  region: DashboardRegion;
  command: FocusCommand;
  onClose: () => void;
  onStartVoiceCoach?: () => void;
};

export default function FocusPanel({
  region,
  command,
  onClose,
  onStartVoiceCoach,
}: FocusPanelProps) {
  const steps = buildFocusSteps(command);
  const tools = buildFocusTools(command);
  const safety = buildFocusSafety(command);

  const [stepIndex, setStepIndex] = useState(0);
  const [coaching, setCoaching] = useState(false);
  const [ttsOk, setTtsOk] = useState(false);

  const coachingRef = useRef(false);
  const stepIndexRef = useRef(0);
  const stepsRef = useRef(steps);

  useBodyScrollLock(true);

  useEffect(() => {
    setTtsOk(isSpeechSynthesisSupported());
    return () => stopSpeaking();
  }, []);

  useEffect(() => {
    setStepIndex(0);
    stepIndexRef.current = 0;
    setCoaching(false);
    coachingRef.current = false;
    stopSpeaking();
  }, [command.part, command.action, command.message]);

  useEffect(() => {
    stepsRef.current = steps;
  }, [steps]);

  useEffect(() => {
    stepIndexRef.current = stepIndex;
  }, [stepIndex]);

  const currentStep = steps[stepIndex] ?? steps[0] ?? "";
  const progress =
    steps.length > 0 ? ((stepIndex + 1) / steps.length) * 100 : 0;
  const isLast = stepIndex >= steps.length - 1;

  const speakStep = (index: number, continueCoach: boolean) => {
    if (!ttsOk) return;
    const list = stepsRef.current;
    const text = list[index];
    if (!text) return;

    speakText(`Step ${index + 1} of ${list.length}. ${text}`, {
      onEnd: () => {
        if (!continueCoach || !coachingRef.current) return;

        if (index < list.length - 1) {
          const next = index + 1;
          stepIndexRef.current = next;
          setStepIndex(next);
          // Brief pause before next step
          window.setTimeout(() => {
            if (coachingRef.current) speakStep(next, true);
          }, 450);
        } else {
          coachingRef.current = false;
          setCoaching(false);
          speakText(
            "That's all the focus steps for now. Tell me when you're ready for the next action.",
          );
        }
      },
    });
  };

  const handleStartCoach = () => {
    coachingRef.current = true;
    setCoaching(true);
    onStartVoiceCoach?.();
    speakStep(stepIndexRef.current, true);
  };

  const handleStopCoach = () => {
    coachingRef.current = false;
    setCoaching(false);
    stopSpeaking();
  };

  const handleReadCurrent = () => {
    coachingRef.current = false;
    setCoaching(false);
    speakStep(stepIndex, false);
  };

  const goPrev = () => {
    stopSpeaking();
    coachingRef.current = false;
    setCoaching(false);
    setStepIndex((i) => Math.max(0, i - 1));
  };

  const goNext = () => {
    stopSpeaking();
    coachingRef.current = false;
    setCoaching(false);
    setStepIndex((i) => Math.min(steps.length - 1, i + 1));
  };

  const handleNextAndSpeak = () => {
    if (isLast) {
      if (ttsOk) {
        speakText("You've completed all focus steps. Nice work.");
      }
      return;
    }
    const next = stepIndex + 1;
    stopSpeaking();
    coachingRef.current = false;
    setCoaching(false);
    setStepIndex(next);
    if (ttsOk) {
      window.setTimeout(() => speakStep(next, false), 120);
    }
  };

  const zoom = 2.35;
  const vbW = 760 / zoom;
  const vbH = 360 / zoom;
  const vbX = Math.max(0, Math.min(760 - vbW, region.center.x - vbW / 2));
  const vbY = Math.max(0, Math.min(360 - vbH, region.center.y - vbH / 2));

  return (
    <div
      className="focus-panel-root fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="focus-panel-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        aria-label="Close focus panel"
        onClick={onClose}
      />

      <div className="focus-panel-sheet relative z-10 flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-slate-700 bg-[#0c1220] shadow-2xl sm:max-h-[88dvh] sm:rounded-3xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-800 px-5 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-cyan-400">
              AI Focus Mode
            </p>
            <h2
              id="focus-panel-title"
              className="mt-1 text-xl font-bold text-white"
            >
              {region.name}
            </h2>
            {command.message && (
              <p className="mt-1 text-sm text-slate-400">{command.message}</p>
            )}
            {command.action && (
              <p className="mt-2 inline-flex rounded-lg bg-amber-500/15 px-2 py-1 text-xs font-medium text-amber-300">
                {command.action.replace(/_/g, " ")}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-800 hover:text-white"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Progress */}
        <div className="border-b border-slate-800 px-5 py-3">
          <div className="mb-1.5 flex items-center justify-between text-[11px] text-slate-400">
            <span>
              Step {stepIndex + 1} of {steps.length}
            </span>
            <span className="font-medium text-cyan-300/90">
              {Math.round(progress)}%
            </span>
          </div>
          <div
            className="h-2 overflow-hidden rounded-full bg-slate-800"
            role="progressbar"
            aria-valuenow={Math.round(progress)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Focus step progress"
          >
            <div
              className="focus-progress-fill h-full rounded-full transition-[width] duration-300 ease-out"
              style={{
                width: `${progress}%`,
                background: `linear-gradient(90deg, ${region.color}, #22d3ee)`,
              }}
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div
            className="focus-zoom relative overflow-hidden rounded-2xl border border-slate-700 bg-[#070b14] p-2"
            style={{ borderColor: `${region.color}55` }}
          >
            <svg
              viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
              className="h-36 w-full sm:h-44"
              aria-hidden
            >
              <path
                d="M130 175 Q210 95 390 90 Q610 100 650 175 Q700 220 650 270 Q390 305 130 265 Z"
                fill="#1e2937"
                stroke="#334155"
                strokeWidth="12"
              />
              <g
                className="focus-hotspot-group"
                style={{
                  transformOrigin: `${region.center.x}px ${region.center.y}px`,
                }}
              >
                <path
                  d={region.hitPath}
                  fill={region.color}
                  fillOpacity={0.55}
                  stroke={region.color}
                  strokeWidth={3}
                  className="focus-hotspot"
                />
              </g>
            </svg>
            <p className="absolute bottom-2 left-3 text-[10px] font-medium uppercase tracking-wide text-slate-500">
              Zoomed · {region.shortLabel}
            </p>
          </div>

          <div className="mt-5">
            <div
              className="rounded-2xl border px-4 py-4 text-sm leading-relaxed text-slate-200"
              style={{
                borderColor: `${region.color}44`,
                background: `${region.color}12`,
              }}
            >
              {currentStep}
            </div>

            <ol className="mt-3 space-y-1.5">
              {steps.map((step, i) => (
                <li key={`${i}-${step.slice(0, 24)}`}>
                  <button
                    type="button"
                    onClick={() => {
                      stopSpeaking();
                      coachingRef.current = false;
                      setCoaching(false);
                      setStepIndex(i);
                    }}
                    className={`w-full rounded-xl px-3 py-2 text-left text-xs transition ${
                      i === stepIndex
                        ? "bg-cyan-500/15 text-cyan-200"
                        : i < stepIndex
                          ? "text-slate-500 line-through decoration-slate-600"
                          : "text-slate-500 hover:bg-slate-800/80 hover:text-slate-300"
                    }`}
                  >
                    <span className="mr-2 font-semibold opacity-70">
                      {i + 1}.
                    </span>
                    {step}
                  </button>
                </li>
              ))}
            </ol>
          </div>

          <div className="mt-5">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
              <Wrench className="h-4 w-4 text-slate-400" />
              Tools
            </h3>
            <ul className="space-y-1.5 text-sm text-slate-400">
              {tools.map((tool) => (
                <li key={tool} className="flex gap-2">
                  <span className="text-cyan-500">•</span>
                  {tool}
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-5 rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-300">
              <ShieldAlert className="h-4 w-4" />
              Safety
            </h3>
            <ul className="space-y-1.5 text-xs leading-relaxed text-amber-100/80">
              {safety.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
            <LiabilityDisclaimer variant="inline" className="mt-3 text-amber-100/70" />
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-slate-800 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={goPrev}
              disabled={stepIndex === 0}
              className="flex min-h-[48px] items-center justify-center gap-1 rounded-2xl border border-slate-700 px-3 text-sm text-slate-300 disabled:opacity-30"
              aria-label="Previous step"
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </button>
            <button
              type="button"
              onClick={handleNextAndSpeak}
              className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-2xl bg-cyan-500 px-4 text-sm font-semibold text-black hover:bg-cyan-400"
            >
              {isLast ? "Done" : "Next Step"}
            </button>
          </div>

          {ttsOk && (
            <button
              type="button"
              onClick={coaching ? handleStopCoach : handleStartCoach}
              className={`flex min-h-[48px] items-center justify-center gap-2 rounded-2xl px-4 text-sm font-semibold transition ${
                coaching
                  ? "bg-red-500/20 text-red-300 ring-1 ring-red-400/40"
                  : "border border-cyan-500/40 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20"
              }`}
            >
              <Mic className="h-4 w-4" />
              {coaching
                ? "Stop voice coach"
                : "Voice coach — read & auto-advance"}
            </button>
          )}

          <div className="flex gap-2">
            {ttsOk && (
              <button
                type="button"
                onClick={handleReadCurrent}
                disabled={coaching}
                className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-slate-600 px-3 py-3 text-sm text-slate-200 hover:border-cyan-500/40 disabled:opacity-40"
              >
                <Volume2 className="h-4 w-4" />
                Read this step
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="flex flex-1 items-center justify-center rounded-2xl border border-slate-700 px-3 py-3 text-sm text-slate-400 hover:text-white"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
