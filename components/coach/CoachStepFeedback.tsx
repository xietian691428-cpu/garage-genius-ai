"use client";

import { useState } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import type { CoachStepFeedbackVote } from "@/lib/types/coach-scenario";
import { supabase } from "@/lib/supabase";
import { useTranslation } from "react-i18next";

type Props = {
  prompt?: string;
  disabled?: boolean;
  onVote: (
    vote: CoachStepFeedbackVote,
    note?: string,
  ) => Promise<{ stored?: boolean } | void> | { stored?: boolean } | void;
};

/**
 * “Was this step useful?” — Yes / No (+ optional note when No).
 */
export default function CoachStepFeedback({
  prompt,
  disabled,
  onVote,
}: Props) {
  const { t } = useTranslation();
  const [sent, setSent] = useState<CoachStepFeedbackVote | null>(null);
  const [busy, setBusy] = useState(false);
  const [awaitingNote, setAwaitingNote] = useState(false);
  const [note, setNote] = useState("");
  const [storedHint, setStoredHint] = useState<boolean | null>(null);

  const finish = async (vote: CoachStepFeedbackVote, noteText?: string) => {
    if (busy || sent) return;
    setBusy(true);
    try {
      const result = await onVote(vote, noteText?.trim() || undefined);
      setSent(vote);
      if (result && typeof result === "object" && "stored" in result) {
        setStoredHint(Boolean(result.stored));
      }
    } finally {
      setBusy(false);
      setAwaitingNote(false);
    }
  };

  const handleYes = () => void finish("yes");
  const handleNo = () => setAwaitingNote(true);
  const submitNo = () => void finish("no", note);

  if (sent) {
    return (
      <p className="text-center text-xs text-slate-500">
        {t("coach.feedbackThanks")}
        {storedHint === false ? (
          <span className="mt-1 block text-[10px] text-slate-600">
            {t("coach.feedbackLocalOnly")}
          </span>
        ) : null}
      </p>
    );
  }

  if (awaitingNote) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 px-3 py-3">
        <p className="mb-2 text-center text-xs font-medium text-slate-300">
          {t("coach.feedbackWhyNot")}
        </p>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, 500))}
          rows={2}
          placeholder={t("coach.feedbackNotePlaceholder")}
          className="mb-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-cyan-500 focus:outline-none"
        />
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={submitNo}
            className="flex flex-1 items-center justify-center rounded-xl bg-slate-800 px-3 py-2.5 text-sm font-medium text-slate-200 hover:bg-slate-700 disabled:opacity-50"
          >
            {t("coach.feedbackSubmit")}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void finish("no")}
            className="flex flex-1 items-center justify-center rounded-xl border border-slate-700 px-3 py-2.5 text-sm text-slate-400 hover:border-slate-500 disabled:opacity-50"
          >
            {t("coach.feedbackSkipNote")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 px-3 py-3">
      <p className="mb-2 text-center text-xs font-medium text-slate-300">
        {prompt || t("coach.feedbackPrompt")}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={disabled || busy}
          onClick={handleYes}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-cyan-500/15 px-3 py-2.5 text-sm font-medium text-cyan-300 transition hover:bg-cyan-500/25 disabled:opacity-50"
        >
          <ThumbsUp className="h-4 w-4" />
          {t("coach.feedbackYes")}
        </button>
        <button
          type="button"
          disabled={disabled || busy}
          onClick={handleNo}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-slate-800 px-3 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-slate-700 disabled:opacity-50"
        >
          <ThumbsDown className="h-4 w-4" />
          {t("coach.feedbackNo")}
        </button>
      </div>
    </div>
  );
}

export async function postCoachStepFeedback(payload: {
  scenario_slug: string;
  scenario_id: string;
  step_id: string;
  vote: CoachStepFeedbackVote;
  vehicle_mileage?: number;
  vehicle_make?: string;
  vehicle_model?: string;
  note?: string;
  client_session_id?: string;
}): Promise<{ ok: boolean; stored: boolean }> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    const res = await fetch("/api/coach/feedback", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return { ok: false, stored: false };
    const json = (await res.json()) as { ok?: boolean; stored?: boolean };
    return { ok: json.ok !== false, stored: Boolean(json.stored) };
  } catch {
    return { ok: false, stored: false };
  }
}
