"use client";

import { Lock } from "lucide-react";

/** Preset garage tags used for Coach personalization (Pro). */
export const PROFILE_TAG_OPTIONS = [
  "Modified",
  "Tow",
  "Classic",
  "EV",
  "Daily Driver",
] as const;

export type ProfileTagOption = (typeof PROFILE_TAG_OPTIONS)[number];

type Props = {
  value: string[];
  onChange: (next: string[]) => void;
  /** When false, taps call onLockedClick instead of toggling */
  canEdit: boolean;
  onLockedClick?: () => void;
  label?: string;
  hint?: string;
};

export default function VehicleProfileTags({
  value,
  onChange,
  canEdit,
  onLockedClick,
  label = "Profile tags",
  hint,
}: Props) {
  const toggle = (tag: string) => {
    if (!canEdit) {
      onLockedClick?.();
      return;
    }
    const on = value.includes(tag);
    onChange(on ? value.filter((t) => t !== tag) : [...value, tag]);
  };

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <p className="text-sm text-slate-400">{label}</p>
        {!canEdit && (
          <span className="inline-flex items-center gap-1 rounded-md bg-cyan-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cyan-300">
            <Lock className="h-3 w-3" />
            Pro
          </span>
        )}
      </div>
      {(hint || !canEdit) && (
        <p className="mb-2 text-[11px] text-slate-500">
          {hint ||
            "Upgrade to Pro to personalize Coach Guides with Modified, Tow, Classic, and more."}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {PROFILE_TAG_OPTIONS.map((tag) => {
          const on = value.includes(tag);
          return (
            <button
              key={tag}
              type="button"
              onClick={() => toggle(tag)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                on && canEdit
                  ? "bg-cyan-500/20 text-cyan-200 ring-1 ring-cyan-400/50"
                  : canEdit
                    ? "bg-slate-800 text-slate-400 hover:text-slate-200"
                    : "bg-slate-800/60 text-slate-500"
              }`}
            >
              {tag}
            </button>
          );
        })}
      </div>
    </div>
  );
}
