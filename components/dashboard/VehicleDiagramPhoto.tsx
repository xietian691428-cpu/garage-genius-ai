"use client";

import { useId } from "react";
import type { VehicleBodyClass } from "@/lib/vehicle-body-class";
import {
  VEHICLE_DIAGRAM_VB,
  vehicleDiagramImageSrc,
} from "@/lib/vehicle-diagram-geometry";

type Props = {
  bodyClass?: VehicleBodyClass;
  /** Soften photo when a system is emphasized */
  muted?: boolean;
  className?: string;
};

/**
 * Photoreal side-profile layer for the vehicle systems diagram.
 * Body class picks sedan / SUV / pickup / EV — not a specific brand.
 */
export default function VehicleDiagramPhoto({
  bodyClass = "sedan",
  muted = false,
  className,
}: Props) {
  const uid = useId().replace(/:/g, "");
  const vignetteId = `gg-photo-vignette-${uid}`;
  const src = vehicleDiagramImageSrc(bodyClass);

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
        href={src}
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
