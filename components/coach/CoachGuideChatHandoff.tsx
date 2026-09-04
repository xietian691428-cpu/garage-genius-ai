"use client";

import { useTranslation } from "react-i18next";
import HighRiskSafetyCallout from "@/components/chat/HighRiskSafetyCallout";
import {
  CONTINUE_GUIDE_CHIP_ID,
  NEW_QUESTION_CHIP_ID,
} from "@/lib/coach-guide-chat";
import type { SafetyTopicHit } from "@/lib/safety-topics";

type Props = {
  safetyHits: SafetyTopicHit[];
  onContinue: () => void;
  onNewQuestion: () => void;
};

/** Peripheral Guide→Chat chips. Does not change CoachScenarioPlayer steps. */
export default function CoachGuideChatHandoff({
  safetyHits,
  onContinue,
  onNewQuestion,
}: Props) {
  const { t } = useTranslation();

  return (
    <div className="space-y-2" data-testid="coach-guide-chat-handoff">
      {safetyHits.length > 0 ? (
        <HighRiskSafetyCallout hits={safetyHits} />
      ) : null}
      <p className="text-[11px] leading-relaxed text-slate-500">
        {t("coach.guideChatHandoffHint")}
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          data-testid={CONTINUE_GUIDE_CHIP_ID}
          onClick={onContinue}
          className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-2xl bg-cyan-500 px-3 py-2.5 text-sm font-semibold text-black hover:bg-cyan-400"
        >
          {t("coach.continueThisGuide")}
        </button>
        <button
          type="button"
          data-testid={NEW_QUESTION_CHIP_ID}
          onClick={onNewQuestion}
          className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-2xl border border-slate-600 px-3 py-2.5 text-sm font-semibold text-slate-100 hover:bg-slate-800"
        >
          {t("coach.askNewQuestion")}
        </button>
      </div>
    </div>
  );
}
