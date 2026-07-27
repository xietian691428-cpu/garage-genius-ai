"use client";

import { useState } from "react";
import Link from "next/link";
import { BookPlus, Check, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import type {
  CoachAdoptKnowledgeRequest,
  CoachAdoptKnowledgeResponse,
  CoachStepFeedbackVote,
} from "@/lib/types/coach-scenario";

type Props = {
  payload: Omit<CoachAdoptKnowledgeRequest, "last_vote" | "quality_score"> & {
    last_vote?: CoachStepFeedbackVote | null;
    quality_score?: number;
  };
  /** Compact style for in-step footer vs completion CTA */
  variant?: "step" | "completion";
};

/**
 * Adopt current Coach step / completion into knowledge_base for RAG.
 * Logged-in users see the adopt button; guests see a sign-in prompt.
 */
export default function CoachAdoptKnowledgeButton({
  payload,
  variant = "step",
}: Props) {
  const { t } = useTranslation();
  const { user, loading: authLoading } = useAuth();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);

  const adopt = async () => {
    if (busy || done || !user) return;
    setBusy(true);
    setFailed(false);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        setFailed(true);
        return;
      }
      const res = await fetch("/api/coach/adopt-knowledge", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as CoachAdoptKnowledgeResponse & {
        error?: string;
        code?: string;
      };
      if (!res.ok || !json.ok) {
        setFailed(true);
        return;
      }
      setDone(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  if (authLoading) return null;

  if (done) {
    return (
      <p
        className={`flex items-center gap-1.5 text-xs text-emerald-400 ${
          variant === "completion" ? "justify-center py-1" : ""
        }`}
        role="status"
      >
        <Check className="h-3.5 w-3.5 shrink-0" />
        {t("coach.adoptSuccess")}
      </p>
    );
  }

  if (!user) {
    return (
      <p
        className={`text-center text-xs text-slate-400 ${
          variant === "completion" ? "py-1" : ""
        }`}
      >
        {t("coach.adoptSignInPrompt")}{" "}
        <Link
          href="/login?next=/app"
          className="font-medium text-cyan-400 underline-offset-2 hover:underline"
        >
          {t("coach.adoptSignInLink")}
        </Link>
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        disabled={busy}
        onClick={() => void adopt()}
        className={`inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-cyan-500/40 bg-cyan-500/10 px-4 text-sm font-semibold text-cyan-200 transition hover:bg-cyan-500/20 disabled:opacity-50 ${
          variant === "completion" ? "py-3.5" : "py-2.5"
        }`}
      >
        {busy ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
        ) : (
          <BookPlus className="h-4 w-4 shrink-0" />
        )}
        {busy ? t("coach.adoptSaving") : t("coach.adoptButton")}
      </button>
      {failed ? (
        <p className="text-center text-[11px] text-red-400">
          {t("coach.adoptFailed")}
        </p>
      ) : null}
    </div>
  );
}
