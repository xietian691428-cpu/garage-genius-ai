"use client";

import { useState } from "react";
import { ImageOff } from "lucide-react";
import DiyMediaFrame from "@/components/diy-visuals/DiyMediaFrame";

type Props = {
  /** Part display name — always shown */
  name: string;
  /** Optional OEM / aftermarket hint */
  detail?: string;
  /** Close-up photo URL; omit rather than show a wrong part */
  src?: string | null;
  className?: string;
};

/**
 * Class B — part identification card.
 * If `src` is missing or fails, keep the name and hide any fake illustration.
 */
export default function PartImage({ name, detail, src, className }: Props) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(src) && !failed;

  return (
    <DiyMediaFrame
      testId="part-image"
      label={name}
      caption={detail || (showImage ? "Part close-up" : "No photo — identify by name and fitment notes")}
      aspectClassName="aspect-square"
      className={className}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src!}
          alt={name}
          className="h-full w-full object-contain bg-slate-950 p-3"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
          <ImageOff className="h-7 w-7 text-slate-600" aria-hidden />
          <p className="text-xs text-slate-500">Photo not provided</p>
        </div>
      )}
    </DiyMediaFrame>
  );
}
