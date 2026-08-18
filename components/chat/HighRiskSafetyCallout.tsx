"use client";

import { AlertTriangle } from "lucide-react";
import type { SafetyTopicHit } from "@/lib/safety-topics";

type Props = {
  hits: SafetyTopicHit[];
};

/**
 * In-reply high-risk callout(s) — cannot be disabled in settings.
 * Copy comes from matched safety topics (lib/safety-topics).
 */
export default function HighRiskSafetyCallout({ hits }: Props) {
  if (!hits.length) return null;

  return (
    <div className="mt-3 space-y-2" data-testid="chat-high-risk-callouts">
      {hits.map((hit) => (
        <div
          key={hit.topic.id}
          data-testid="chat-high-risk-callout"
          data-topic-id={hit.topic.id}
          data-severity={hit.topic.severity}
          role="note"
          className="flex gap-2 rounded-2xl border border-amber-500/35 bg-amber-500/10 px-3 py-2.5 text-xs leading-relaxed text-amber-100"
        >
          <AlertTriangle
            className="mt-0.5 h-4 w-4 shrink-0 text-amber-300"
            aria-hidden
          />
          <p>{hit.callout}</p>
        </div>
      ))}
    </div>
  );
}
