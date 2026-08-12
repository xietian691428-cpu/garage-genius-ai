"use client";

import { useId } from "react";
import {
  VEHICLE_DIAGRAM_IMAGE_SRC,
  VEHICLE_DIAGRAM_VB,
} from "@/lib/vehicle-diagram-geometry";

type Props = {
  /** Soften photo when a system is emphasized */
  muted?: boolean;
  className?: string;
};

/**
 * Photoreal side-profile layer for the vehicle systems diagram.
 * Car faces LEFT — hotspots are calibrated in viewBox 760×507.
 */
export default function VehicleDiagramPhoto({ muted = false, className }: Props) {
  const uid = useId().replace(/:/g, "");
  const vignetteId = `gg-photo-vignette-${uid}`;

  return (
    <g
      className={className}
      opacity={muted ? 0.62 : 1}
      style={{ transition: "opacity 200ms ease" }}
    >
      <defs>
        <radialGradient id={vignetteId} cx="50%" cy="48%" r="70%">
          <stop offset="50%" stopColor="#020617" stopOpacity="0" />
          <stop offset="100%" stopColor="#020617" stopOpacity="0.5" />
        </radialGradient>
      </defs>
      <image
        href={VEHICLE_DIAGRAM_IMAGE_SRC}
        x={0}
        y={0}
        width={VEHICLE_DIAGRAM_VB.w}
        height={VEHICLE_DIAGRAM_VB.h}
        preserveAspectRatio="xMidYMid meet"
      />
      <rect
        x={0}
        y={0}
        width={VEHICLE_DIAGRAM_VB.w}
        height={VEHICLE_DIAGRAM_VB.h}
        fill={`url(#${vignetteId})`}
        pointerEvents="none"
      />
    </g>
  );
}
