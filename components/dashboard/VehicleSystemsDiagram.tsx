"use client";

import { useMemo, useState } from "react";
import type { DashboardRegion } from "@/lib/types/dashboard";
import type { VehicleInfo } from "@/lib/types/chat";
import { focusPartToRegionId, type FocusCommand } from "@/lib/types/focus";
import {
  inferVehicleBodyClass,
  vehicleBodyClassLabel,
} from "@/lib/vehicle-body-class";
import { VEHICLE_DIAGRAM_VB } from "@/lib/vehicle-diagram-geometry";
import VehicleDiagramPhoto from "@/components/dashboard/VehicleDiagramPhoto";
import FocusOverlay from "@/components/dashboard/FocusOverlay";

type Props = {
  vehicle?: VehicleInfo | null;
  regions: DashboardRegion[];
  selectedRegionId: string | null;
  activeFocus: FocusCommand | null;
  focusRegion: DashboardRegion | null;
  isRegionVisible: (region: DashboardRegion) => boolean;
  isRegionHighlighted: (region: DashboardRegion) => boolean;
  onRegionSelect: (region: DashboardRegion) => void;
};

function regionIndex(regions: DashboardRegion[], id: string): number {
  const i = regions.findIndex((r) => r.id === id);
  return i >= 0 ? i + 1 : 0;
}

/**
 * Photoreal vehicle systems diagram:
 * side-profile photo + calibrated translucent zones + numbered anchors.
 */
export default function VehicleSystemsDiagram({
  vehicle,
  regions,
  selectedRegionId,
  activeFocus,
  focusRegion,
  isRegionVisible,
  isRegionHighlighted,
  onRegionSelect,
}: Props) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const bodyClass = inferVehicleBodyClass(vehicle);

  const focusRegionId = activeFocus
    ? focusPartToRegionId(activeFocus.part)
    : null;

  const emphasizedId = hoveredId || selectedRegionId || focusRegionId;
  const emphasized = useMemo(
    () => regions.find((r) => r.id === emphasizedId) ?? null,
    [regions, emphasizedId],
  );

  return (
    <div data-testid="vehicle-system-diagram" className="relative">
      <div className="relative overflow-hidden rounded-2xl border border-slate-800/80 bg-[#070b14] p-3 sm:p-5">
        <p
          className="mb-2 text-center text-[11px] font-medium uppercase tracking-wider text-slate-500"
          data-testid="vehicle-diagram-body-class"
        >
          {vehicleBodyClassLabel(bodyClass)} · location map
        </p>
        <svg
          viewBox={`0 0 ${VEHICLE_DIAGRAM_VB.w} ${VEHICLE_DIAGRAM_VB.h}`}
          className="mx-auto h-auto w-full max-w-[760px]"
          role="img"
          aria-label={`${vehicleBodyClassLabel(bodyClass)} systems diagram`}
        >
          <VehicleDiagramPhoto
            bodyClass={bodyClass}
            muted={Boolean(emphasizedId)}
          />

          {regions.map((region) => {
            const visible = isRegionVisible(region);
            const n = regionIndex(regions, region.id);
            const isEmphasized = emphasizedId === region.id;
            const isOtherDimmed = Boolean(emphasizedId) && !isEmphasized;
            const highlighted = isRegionHighlighted(region);
            const selected = selectedRegionId === region.id;

            const zoneOpacity = !visible
              ? 0.02
              : isEmphasized
                ? 0.34
                : isOtherDimmed
                  ? 0.02
                  : highlighted
                    ? 0.14
                    : 0.09;

            const markerOpacity = !visible ? 0.2 : isOtherDimmed ? 0.28 : 1;

            return (
              <g
                key={region.id}
                data-testid={`system-hotspot-${region.id}`}
                className={visible ? "cursor-pointer" : "pointer-events-none"}
                onClick={() => visible && onRegionSelect(region)}
                onMouseEnter={() => setHoveredId(region.id)}
                onMouseLeave={() => setHoveredId(null)}
                onFocus={() => setHoveredId(region.id)}
                onBlur={() => setHoveredId(null)}
                role="button"
                tabIndex={visible ? 0 : -1}
                aria-label={`${n}. ${region.name}. ${region.description}`}
                aria-pressed={selected || focusRegionId === region.id}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    if (visible) onRegionSelect(region);
                  }
                }}
              >
                <path
                  d={region.hitPath}
                  fill={region.color}
                  fillOpacity={zoneOpacity}
                  stroke={region.color}
                  strokeWidth={isEmphasized ? 2.25 : 1.15}
                  strokeOpacity={
                    !visible
                      ? 0.08
                      : isEmphasized
                        ? 0.95
                        : isOtherDimmed
                          ? 0.12
                          : 0.4
                  }
                  style={{
                    transition:
                      "fill-opacity 200ms ease, stroke-opacity 200ms ease",
                  }}
                />

                {/* Expanded hit target (~48px at default scale) */}
                <circle
                  cx={region.center.x}
                  cy={region.center.y}
                  r={24}
                  fill="transparent"
                />

                <g
                  opacity={markerOpacity}
                  style={{ transition: "opacity 200ms ease" }}
                >
                  <circle
                    cx={region.center.x}
                    cy={region.center.y}
                    r={isEmphasized ? 15 : 13}
                    fill={isEmphasized ? region.color : "#0f172a"}
                    stroke={region.color}
                    strokeWidth={isEmphasized ? 2 : 1.5}
                    strokeOpacity={isEmphasized ? 1 : 0.85}
                  />
                  <text
                    x={region.center.x}
                    y={region.center.y + 1}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill={isEmphasized ? "#0f172a" : "#e2e8f0"}
                    fontSize="11"
                    fontWeight="700"
                    className="pointer-events-none select-none"
                    style={{
                      fontFamily: "ui-sans-serif, system-ui, sans-serif",
                    }}
                  >
                    {n}
                  </text>
                </g>
              </g>
            );
          })}

          {emphasized && isRegionVisible(emphasized) && (
            <g
              data-testid={`system-callout-${emphasized.id}`}
              className="pointer-events-none"
            >
              <line
                x1={emphasized.center.x}
                y1={emphasized.center.y}
                x2={emphasized.callout?.x ?? emphasized.center.x}
                y2={emphasized.callout?.y ?? emphasized.center.y - 40}
                stroke={emphasized.color}
                strokeWidth="1.25"
                strokeOpacity="0.7"
              />
              <circle
                cx={emphasized.callout?.x ?? emphasized.center.x}
                cy={emphasized.callout?.y ?? emphasized.center.y - 40}
                r="3"
                fill={emphasized.color}
              />
              <rect
                x={(emphasized.callout?.x ?? emphasized.center.x) - 54}
                y={(emphasized.callout?.y ?? emphasized.center.y - 40) - 28}
                width="108"
                height="24"
                rx="6"
                fill="#0f172a"
                stroke={emphasized.color}
                strokeOpacity="0.55"
                strokeWidth="1"
              />
              <text
                x={emphasized.callout?.x ?? emphasized.center.x}
                y={(emphasized.callout?.y ?? emphasized.center.y - 40) - 12}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#f8fafc"
                fontSize="11"
                fontWeight="600"
                className="select-none"
                style={{
                  fontFamily: "ui-sans-serif, system-ui, sans-serif",
                }}
              >
                {emphasized.shortLabel}
              </text>
            </g>
          )}
        </svg>

        {focusRegion && (
          <FocusOverlay
            region={focusRegion}
            active={Boolean(activeFocus)}
            bodyClass={bodyClass}
          />
        )}
      </div>

      <p
        className="mt-3 min-h-[1.25rem] text-center text-xs text-slate-400 sm:text-sm"
        aria-live="polite"
      >
        {emphasized && isRegionVisible(emphasized)
          ? `${emphasized.name} — ${emphasized.description}`
          : "Numbers mark real locations on this vehicle type. Tap a number or choose a system below."}
      </p>

      <div
        className="mt-4 grid grid-cols-1 gap-2 sm:mt-5 sm:grid-cols-2 md:grid-cols-4"
        role="list"
        aria-label="Vehicle systems"
      >
        {regions.map((region) => {
          const n = regionIndex(regions, region.id);
          const visible = isRegionVisible(region);
          const isEmphasized = emphasizedId === region.id;
          const selected = selectedRegionId === region.id;

          return (
            <button
              key={`chip-${region.id}`}
              type="button"
              role="listitem"
              data-testid={`system-chip-${region.id}`}
              disabled={!visible}
              onClick={() => onRegionSelect(region)}
              onMouseEnter={() => setHoveredId(region.id)}
              onMouseLeave={() => setHoveredId(null)}
              onFocus={() => setHoveredId(region.id)}
              onBlur={() => setHoveredId(null)}
              aria-label={`${n}. ${region.name}`}
              aria-pressed={selected || focusRegionId === region.id}
              className={`flex min-h-[44px] items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-sm transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-30 ${
                isEmphasized
                  ? "border-slate-500 bg-slate-800/90 text-white"
                  : "border-slate-800 bg-slate-900/40 text-slate-300 hover:border-slate-700 hover:bg-slate-900/70"
              }`}
              style={
                isEmphasized
                  ? {
                      borderColor: `${region.color}88`,
                      backgroundColor: `${region.color}18`,
                    }
                  : undefined
              }
            >
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
                style={{
                  backgroundColor: isEmphasized
                    ? region.color
                    : `${region.color}22`,
                  color: isEmphasized ? "#0f172a" : region.color,
                  border: `1px solid ${region.color}66`,
                }}
                aria-hidden
              >
                {n}
              </span>
              <span className="block min-w-0 flex-1 truncate font-medium leading-tight">
                {region.name}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
