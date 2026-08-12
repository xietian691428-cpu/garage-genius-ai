"use client";

import type { ReactNode } from "react";

type Props = {
  /** Required human label — never ship image-only */
  label: string;
  /** Optional second line (location, part #, tip) */
  caption?: string;
  /** Aspect ratio utility, default step hero */
  aspectClassName?: string;
  className?: string;
  children: ReactNode;
  /** data-testid for E2E */
  testId?: string;
};

/**
 * Shared dark media frame for DIY photos (location / part / step).
 * See `./STANDARDS.md`.
 */
export default function DiyMediaFrame({
  label,
  caption,
  aspectClassName = "aspect-[16/10]",
  className = "",
  children,
  testId = "diy-media-frame",
}: Props) {
  return (
    <figure
      data-testid={testId}
      className={`overflow-hidden rounded-2xl border border-slate-800 bg-[#070b14] ${className}`}
    >
      <div
        className={`relative w-full overflow-hidden bg-slate-950 ${aspectClassName}`}
      >
        {children}
      </div>
      <figcaption className="border-t border-slate-800/80 px-3 py-2.5">
        <p className="text-sm font-medium leading-snug text-slate-100">{label}</p>
        {caption ? (
          <p className="mt-0.5 text-xs leading-snug text-slate-400">{caption}</p>
        ) : null}
      </figcaption>
    </figure>
  );
}
