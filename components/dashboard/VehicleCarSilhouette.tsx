"use client";

import { useId } from "react";
import { VEHICLE_CAR_PATHS } from "@/lib/vehicle-diagram-geometry";

type Props = {
  /** Dim the body when a system is emphasized */
  muted?: boolean;
  className?: string;
};

/** Refined side-profile sedan used by map, focus overlay, and focus panel. */
export default function VehicleCarSilhouette({ muted = false, className }: Props) {
  const uid = useId().replace(/:/g, "");
  const bodyGrad = `gg-car-body-${uid}`;
  const glassGrad = `gg-car-glass-${uid}`;
  const bodyOpacity = muted ? 0.45 : 1;
  const { body, glass, character, shadow, frontWheel, rearWheel, frontHub, rearHub } =
    VEHICLE_CAR_PATHS;

  return (
    <g
      className={className}
      opacity={bodyOpacity}
      style={{ transition: "opacity 200ms ease" }}
    >
      <defs>
        <linearGradient id={bodyGrad} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#1e293b" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#0f172a" stopOpacity="0.98" />
        </linearGradient>
        <linearGradient id={glassGrad} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#67e8f9" stopOpacity="0.16" />
          <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.06" />
        </linearGradient>
      </defs>

      <path d={shadow} fill="#020617" opacity="0.45" />

      <path
        d={body}
        fill={`url(#${bodyGrad})`}
        stroke="#94a3b8"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path
        d={glass}
        fill={`url(#${glassGrad})`}
        stroke="#64748b"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
      <path
        d={character}
        fill="none"
        stroke="#475569"
        strokeWidth="1"
        strokeLinecap="round"
        opacity="0.7"
      />

      <circle
        cx={frontWheel.cx}
        cy={frontWheel.cy}
        r={frontWheel.r}
        fill="#020617"
        stroke="#64748b"
        strokeWidth="2"
      />
      <circle
        cx={frontHub.cx}
        cy={frontHub.cy}
        r={frontHub.r}
        fill="#0f172a"
        stroke="#475569"
        strokeWidth="1.25"
      />
      <circle
        cx={rearWheel.cx}
        cy={rearWheel.cy}
        r={rearWheel.r}
        fill="#020617"
        stroke="#64748b"
        strokeWidth="2"
      />
      <circle
        cx={rearHub.cx}
        cy={rearHub.cy}
        r={rearHub.r}
        fill="#0f172a"
        stroke="#475569"
        strokeWidth="1.25"
      />
    </g>
  );
}
