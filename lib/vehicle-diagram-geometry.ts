/**
 * Vehicle systems diagram geometry — photoreal side profiles (viewBox 760×507).
 * Images face LEFT. Hotspot coordinates are shared across body classes
 * with consistent framing (generic + Tesla model photos).
 */

import type { VehicleBodyClass } from "@/lib/vehicle-body-class";

export const VEHICLE_DIAGRAM_VB = { w: 760, h: 507 } as const;

/** @deprecated Prefer {@link vehicleDiagramImageSrc} — kept for older imports. */
export const VEHICLE_DIAGRAM_IMAGE_SRC = "/images/vehicle-side-sedan.jpg";

export const VEHICLE_DIAGRAM_IMAGES: Record<VehicleBodyClass, string> = {
  sedan: "/images/vehicle-side-sedan.jpg",
  suv: "/images/vehicle-side-suv.jpg",
  pickup: "/images/vehicle-side-pickup.jpg",
  ev: "/images/vehicle-side-ev.jpg",
  mpv: "/images/vehicle-side-mpv.jpg",
  van: "/images/vehicle-side-van.jpg",
  tesla_model_3: "/images/vehicle-side-tesla-model-3.jpg",
  tesla_model_y: "/images/vehicle-side-tesla-model-y.jpg",
  tesla_model_s: "/images/vehicle-side-tesla-model-s.jpg",
  tesla_model_x: "/images/vehicle-side-tesla-model-x.jpg",
  tesla_cybertruck: "/images/vehicle-side-tesla-cybertruck.jpg",
};

export function vehicleDiagramImageSrc(bodyClass: VehicleBodyClass): string {
  return VEHICLE_DIAGRAM_IMAGES[bodyClass] ?? VEHICLE_DIAGRAM_IMAGES.sedan;
}

/**
 * Legacy line silhouette — optional fallbacks only.
 * Prefer the photo layer in VehicleSystemsDiagram.
 */
export const VEHICLE_CAR_PATHS = {
  body: "M90 280 C110 220 160 185 230 175 L290 160 C340 148 400 145 460 150 C530 155 590 175 630 210 C655 230 675 255 682 285 C695 295 708 315 705 340 C702 365 680 380 650 385 L575 392 C560 392 548 402 538 418 C520 448 480 455 450 440 C435 432 425 418 420 400 L340 400 C335 418 322 432 305 440 C275 455 235 448 218 418 C208 402 196 392 180 392 L120 385 C95 380 82 355 85 330 C88 310 88 295 90 280 Z",
  glass:
    "M275 175 C330 160 400 155 470 162 C520 168 560 185 585 205 L565 245 C520 225 460 215 400 215 C350 215 305 222 280 235 Z",
  character: "M160 300 C280 285 420 280 560 295 C610 302 650 318 675 340",
  shadow: "M100 420 C250 445 510 445 670 420 C510 455 250 455 100 420 Z",
  frontWheel: { cx: 178, cy: 398, r: 46 },
  rearWheel: { cx: 588, cy: 398, r: 46 },
  frontHub: { cx: 178, cy: 398, r: 16 },
  rearHub: { cx: 588, cy: 398, r: 16 },
} as const;

export type RegionDiagramMeta = {
  /** Compact zone path(s) — calibrated to the photo, minimal overlap */
  hitPath: string;
  center: { x: number; y: number };
  /** Outside-car callout anchor for leader label */
  callout: { x: number; y: number };
};

/**
 * Compact anatomical zones for the LEFT-facing sedan photo (760×507).
 * Sized to read as “photo hotspots”, not overlapping blobs.
 */
export const REGION_DIAGRAM_META: Record<string, RegionDiagramMeta> = {
  /** 1 — Engine Bay: hood / engine compartment */
  engine: {
    hitPath:
      "M145 220 C175 208 230 208 265 220 C275 235 265 252 230 258 C185 260 145 248 145 220 Z",
    center: { x: 205, y: 232 },
    callout: { x: 205, y: 95 },
  },
  /** 2 — Brake System: front rotor/hub (primary) + rear hub (secondary) */
  brakes: {
    hitPath:
      "M158 372 C172 360 198 360 210 372 C218 388 205 408 178 412 C152 405 145 385 158 372 Z M568 372 C582 360 608 360 620 372 C628 388 615 408 588 412 C562 405 555 385 568 372 Z",
    center: { x: 178, y: 388 },
    callout: { x: 95, y: 455 },
  },
  /** 3 — Suspension: rear wheel-arch (primary) + front arch (secondary) */
  suspension: {
    hitPath:
      "M555 305 C575 292 620 295 635 315 C638 332 620 348 590 348 C560 340 545 322 555 305 Z M145 305 C165 292 205 295 218 315 C220 332 202 348 175 348 C148 340 135 322 145 305 Z",
    center: { x: 595, y: 322 },
    callout: { x: 705, y: 255 },
  },
  /** 4 — Battery & Electrical: forward bay / front corner */
  battery: {
    hitPath:
      "M100 235 C120 222 148 225 158 245 C158 262 138 275 118 272 C100 262 92 248 100 235 Z",
    center: { x: 128, y: 248 },
    callout: { x: 52, y: 175 },
  },
  /** 5 — Tires: compact wheel disks (marker on rear to separate from brakes) */
  tires: {
    hitPath:
      "M148 398a30 30 0 1 0 60 0a30 30 0 1 0-60 0M558 398a30 30 0 1 0 60 0a30 30 0 1 0-60 0",
    center: { x: 588, y: 398 },
    callout: { x: 588, y: 478 },
  },
  /** 6 — HVAC: windshield base / firewall */
  hvac: {
    hitPath:
      "M268 205 C305 192 360 192 392 208 C400 222 388 240 350 245 C305 245 270 232 268 205 Z",
    center: { x: 330, y: 218 },
    callout: { x: 400, y: 90 },
  },
  /** 7 — Transmission: mid underbody between axles */
  transmission: {
    hitPath:
      "M325 335 C370 322 445 322 485 338 C495 352 480 370 430 375 C365 375 315 358 325 335 Z",
    center: { x: 400, y: 348 },
    callout: { x: 400, y: 468 },
  },
  /** 8 — Lights: headlight primary + taillight secondary */
  lights: {
    hitPath:
      "M62 272 C82 258 112 262 120 282 C115 300 90 310 70 302 C55 290 52 280 62 272 Z M662 255 C685 245 715 252 722 272 C715 292 688 302 668 295 C652 280 652 265 662 255 Z",
    center: { x: 90, y: 285 },
    callout: { x: 55, y: 360 },
  },
};
