"use client";

import type { DashboardRegion } from "@/lib/types/dashboard";
import { VEHICLE_DIAGRAM_VB } from "@/lib/vehicle-diagram-geometry";
import VehicleDiagramPhoto from "@/components/dashboard/VehicleDiagramPhoto";

type FocusOverlayProps = {
  region: DashboardRegion;
  /** When true, dims the map and pulses the focused zone */
  active: boolean;
};

/**
 * Semi-transparent mask over the vehicle map with a glowing cutout
 * on the focused region (photo-calibrated hotspots).
 */
export default function FocusOverlay({ region, active }: FocusOverlayProps) {
  if (!active) return null;

  return (
    <div
      className="focus-overlay pointer-events-none absolute inset-0 z-10 overflow-hidden rounded-2xl"
      aria-hidden
    >
      <div className="focus-overlay-dim absolute inset-0 bg-[#020617]/72 backdrop-blur-[1px]" />

      <svg
        className="absolute inset-0 h-full w-full"
        viewBox={`0 0 ${VEHICLE_DIAGRAM_VB.w} ${VEHICLE_DIAGRAM_VB.h}`}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <filter id="focus-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <radialGradient id="focus-pulse" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={region.color} stopOpacity="0.4" />
            <stop offset="100%" stopColor={region.color} stopOpacity="0" />
          </radialGradient>
        </defs>

        <VehicleDiagramPhoto muted />

        <circle
          className="focus-pulse-ring"
          cx={region.center.x}
          cy={region.center.y}
          r="72"
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
            fillOpacity={0.42}
            stroke="#fff"
            strokeWidth={2}
            strokeOpacity={0.8}
            filter="url(#focus-glow)"
            className="focus-hotspot"
          />
          <path
            d={region.hitPath}
            fill="none"
            stroke={region.color}
            strokeWidth={3.5}
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
          fontSize="14"
          fontWeight="700"
          className="focus-label"
          style={{ paintOrder: "stroke", stroke: "#020617", strokeWidth: 3 }}
        >
          {region.shortLabel}
        </text>
      </svg>

      <div className="absolute left-3 top-3 flex items-center gap-2 sm:left-4 sm:top-4">
        <span className="rounded-full border border-cyan-400/40 bg-cyan-500/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-cyan-200">
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
