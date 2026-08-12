"use client";

import { useState } from "react";
import { ImageOff } from "lucide-react";
import type { CoachVisualAsset } from "@/lib/types/coach-scenario";
import DiyMediaFrame from "@/components/diy-visuals/DiyMediaFrame";

type Props = {
  asset?: CoachVisualAsset | null;
  stepTitle: string;
  /** visual_type from step — for a11y only, not shown as a fake “media loaded” badge */
  visualType?: string;
};

/**
 * Coach step hero (Class C / B). Presentational only — does not change player flow.
 * Prefer real photo; on miss/error show honest empty + keep the step title as the label.
 */
export default function CoachStepVisual({
  asset,
  stepTitle,
  visualType,
}: Props) {
  const [failed, setFailed] = useState(false);
  const src = asset?.poster || asset?.src || "";
  const showImage = Boolean(src) && !failed;

  const label = asset?.alt?.trim() || stepTitle;
  const caption =
    asset?.shot_description?.trim() ||
    (showImage
      ? "Photo reference for this step — confirm against your vehicle."
      : "Follow the written steps below. A photo reference will appear here when available.");

  return (
    <DiyMediaFrame
      testId="coach-step-visual"
      label={label}
      caption={caption}
      className="rounded-none border-x-0 border-t-0 sm:rounded-none"
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- coach assets are static public paths
        <img
          src={src}
          alt={label}
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <div
          className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center"
          role="img"
          aria-label={`Photo reference not available for ${stepTitle}`}
        >
          <ImageOff className="h-8 w-8 text-slate-600" aria-hidden />
          <p className="text-sm font-medium text-slate-300">
            Photo reference not available
          </p>
          <p className="max-w-xs text-xs text-slate-500">
            We’d rather show no picture than a misleading one. Use the checklist
            and safety notes under this frame.
          </p>
          {visualType ? (
            <span className="sr-only">Configured media type: {visualType}</span>
          ) : null}
        </div>
      )}
    </DiyMediaFrame>
  );
}
