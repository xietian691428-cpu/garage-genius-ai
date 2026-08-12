/**
 * Vehicle systems diagram geometry — photoreal side profile (viewBox 760×507).
 * Image: /images/vehicle-side-profile.jpg (car facing LEFT).
 * Keep Focus Overlay / Focus Panel in sync with these coordinates.
 */

export const VEHICLE_DIAGRAM_VB = { w: 760, h: 507 } as const;

/** Public asset for the diagram photo layer. */
export const VEHICLE_DIAGRAM_IMAGE_SRC = "/images/vehicle-side-profile.jpg";

/**
 * Legacy line silhouette — kept for optional fallbacks / non-photo contexts.
 * Prefer the photo layer in VehicleSystemsDiagram.
 */
export const VEHICLE_CAR_PATHS = {
  body: "M90 280 C110 220 160 185 230 175 L290 160 C340 148 400 145 460 150 C530 155 590 175 630 210 C655 230 675 255 682 285 C695 295 708 315 705 340 C702 365 680 380 650 385 L575 392 C560 392 548 402 538 418 C520 448 480 455 450 440 C435 432 425 418 420 400 L340 400 C335 418 322 432 305 440 C275 455 235 448 218 418 C208 402 196 392 180 392 L120 385 C95 380 82 355 85 330 C88 310 88 295 90 280 Z",
  glass:
    "M275 175 C330 160 400 155 470 162 C520 168 560 185 585 205 L565 245 C520 225 460 215 400 215 C350 215 305 222 280 235 Z",
  character: "M160 300 C280 285 420 280 560 295 C610 302 650 318 675 340",
  shadow: "M100 420 C250 445 510 445 670 420 C510 455 250 455 100 420 Z",
  frontWheel: { cx: 175, cy: 400, r: 48 },
  rearWheel: { cx: 590, cy: 400, r: 48 },
  frontHub: { cx: 175, cy: 400, r: 18 },
  rearHub: { cx: 590, cy: 400, r: 18 },
} as const;

export type RegionDiagramMeta = {
  /** Compact zone path(s) — calibrated to the photo */
  hitPath: string;
  center: { x: number; y: number };
  /** Outside-car callout anchor for leader label */
  callout: { x: number; y: number };
};

/**
 * Anatomical zones for the LEFT-facing sedan photo (760×507).
 * Keys match DashboardRegion.id.
 */
export const REGION_DIAGRAM_META: Record<string, RegionDiagramMeta> = {
  /** 1 — Engine Bay: front hood / engine compartment */
  engine: {
    hitPath:
      "M115 215 C145 200 195 195 245 200 C275 205 290 225 280 250 C250 265 175 268 135 255 C110 245 105 225 115 215 Z",
    center: { x: 200, y: 232 },
    callout: { x: 200, y: 88 },
  },
  /** 2 — Brake System: front wheel hub / rotor (primary), rear hub secondary */
  brakes: {
    hitPath:
      "M145 365 C160 350 195 350 210 365 C220 385 205 410 175 415 C145 410 130 385 145 365 Z M560 365 C575 350 610 350 625 365 C635 385 620 410 590 415 C560 410 545 385 560 365 Z",
    center: { x: 175, y: 385 },
    callout: { x: 95, y: 455 },
  },
  /** 3 — Suspension: rear wheel-arch / strut area (primary), front arch secondary */
  suspension: {
    hitPath:
      "M545 300 C570 285 625 285 645 305 C655 325 645 350 615 355 C575 355 535 335 545 300 Z M140 300 C165 285 210 285 225 305 C235 325 220 350 185 355 C150 350 125 330 140 300 Z",
    center: { x: 595, y: 320 },
    callout: { x: 700, y: 250 },
  },
  /** 4 — Battery & Electrical: forward engine bay / front corner */
  battery: {
    hitPath:
      "M95 230 C120 215 155 218 170 240 C175 260 155 280 125 282 C100 275 85 250 95 230 Z",
    center: { x: 132, y: 250 },
    callout: { x: 55, y: 175 },
  },
  /** 5 — Tires & Wheels: both wheel disks (marker on rear to separate from brakes) */
  tires: {
    hitPath:
      "M127 400a48 48 0 1 0 96 0a48 48 0 1 0-96 0M542 400a48 48 0 1 0 96 0a48 48 0 1 0-96 0",
    center: { x: 590, y: 400 },
    callout: { x: 590, y: 480 },
  },
  /** 6 — HVAC / Climate: windshield base / firewall / cabin front */
  hvac: {
    hitPath:
      "M255 200 C295 185 360 185 405 200 C420 215 410 240 375 248 C320 252 270 245 255 225 Z",
    center: { x: 330, y: 218 },
    callout: { x: 400, y: 85 },
  },
  /** 7 — Transmission: mid underbody between axles */
  transmission: {
    hitPath:
      "M300 330 C350 315 450 315 500 330 C515 350 500 375 445 382 C360 385 290 370 300 330 Z",
    center: { x: 400, y: 350 },
    callout: { x: 400, y: 470 },
  },
  /** 8 — Lights: headlight primary + taillight secondary */
  lights: {
    hitPath:
      "M55 265 C80 250 115 255 125 280 C120 305 90 318 65 310 C45 295 45 275 55 265 Z M655 250 C685 240 720 250 728 275 C722 300 690 315 665 308 C645 290 645 265 655 250 Z",
    center: { x: 90, y: 285 },
    callout: { x: 55, y: 360 },
  },
};
