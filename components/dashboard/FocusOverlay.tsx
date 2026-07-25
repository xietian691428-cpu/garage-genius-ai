"use client";

import type { DashboardRegion } from "@/lib/types/dashboard";

type FocusOverlayProps = {
  region: DashboardRegion;
  /** When true, dims the map and pulses the focused zone */
  active: boolean;
};

/**
 * Semi-transparent mask over the vehicle map with a glowing, pulsing,
 * slightly magnified cutout on the focused region.
 */
export default function FocusOverlay({ region, active }: FocusOverlayProps) {
  if (!active) return null;

  return (
    <div
      className="focus-overlay pointer-events-none absolute inset-0 z-10 overflow-hidden rounded-2xl"
      aria-hidden
    >
      <div className="focus-overlay-dim absolute inset-0 bg-[#020617]/78 backdrop-blur-[1.5px]" />

      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 760 360"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <filter id="focus-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="8" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <radialGradient id="focus-pulse" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={region.color} stopOpacity="0.65" />
            <stop offset="100%" stopColor={region.color} stopOpacity="0" />
          </radialGradient>
        </defs>

        <circle
          className="focus-pulse-ring"
          cx={region.center.x}
          cy={region.center.y}
          r="88"
          fill="url(#focus-pulse)"
        />
        <circle
          className="focus-pulse-ring focus-pulse-ring-delay"
          cx={region.center.x}
          cy={region.center.y}
          r="88"
          fill="url(#focus-pulse)"
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
            fillOpacity={0.62}
            stroke="#fff"
            strokeWidth={2.5}
            strokeOpacity={0.85}
            filter="url(#focus-glow)"
            className="focus-hotspot"
          />
          <path
            d={region.hitPath}
            fill="none"
            stroke={region.color}
            strokeWidth={5}
            strokeOpacity={0.9}
            className="focus-hotspot-stroke"
          />
        </g>

        <text
          x={region.center.x}
          y={region.center.y}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="#fff"
          fontSize="16"
          fontWeight="800"
          className="focus-label"
          style={{ paintOrder: "stroke", stroke: "#020617", strokeWidth: 4 }}
        >
          {region.shortLabel}
        </text>
      </svg>

      <div className="absolute left-3 top-3 flex items-center gap-2 sm:left-4 sm:top-4">
        <span className="rounded-full border border-cyan-400/50 bg-cyan-500/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-cyan-200 shadow-[0_0_20px_rgba(34,211,238,0.35)]">
          Focus Mode
        </span>
        <span
          className="hidden rounded-full px-2.5 py-1 text-[11px] font-medium text-white/90 sm:inline"
          style={{ backgroundColor: `${region.color}33` }}
        >
          {region.name}
        </span>
      </div>
    </div>
  );
}
