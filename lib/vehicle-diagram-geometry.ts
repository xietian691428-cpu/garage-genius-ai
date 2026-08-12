/**
 * Shared SVG geometry for the Home vehicle systems diagram (viewBox 760×360).
 * Keep Focus Overlay / Focus Panel in sync with these paths.
 */

export const VEHICLE_DIAGRAM_VB = { w: 760, h: 360 } as const;

/** Side-profile sedan — clean stroke, light glass cabin. */
export const VEHICLE_CAR_PATHS = {
  /** Main body silhouette */
  body: "M118 208 C132 168 168 138 218 128 L268 118 C310 108 360 104 410 106 C470 108 530 118 572 138 C598 152 618 172 628 196 C642 202 658 214 662 232 C666 252 652 268 628 272 L560 278 C548 278 538 286 528 298 C510 322 478 328 450 318 C438 314 428 304 424 290 L340 290 C336 304 326 314 314 318 C286 328 254 322 236 298 C226 286 216 278 204 278 L148 272 C128 268 116 250 118 230 C120 220 118 214 118 208 Z",
  /** Cabin / window glass */
  glass:
    "M262 128 C300 116 350 112 400 114 C448 116 492 124 522 138 L508 168 C470 156 420 150 372 150 C330 150 292 154 268 162 Z",
  /** Subtle character line */
  character: "M200 210 C280 198 380 194 480 200 C540 204 590 214 620 228",
  /** Ground shadow */
  shadow: "M150 300 C260 312 500 312 620 300 C500 318 260 318 150 300 Z",
  frontWheel: { cx: 240, cy: 278, r: 36 },
  rearWheel: { cx: 520, cy: 278, r: 36 },
  frontHub: { cx: 240, cy: 278, r: 14 },
  rearHub: { cx: 520, cy: 278, r: 14 },
} as const;

export type RegionDiagramMeta = {
  /** Compact zone path(s) — prefer precise shapes, minimal overlap */
  hitPath: string;
  center: { x: number; y: number };
  /** Outside-car callout anchor for leader label */
  callout: { x: number; y: number };
};

/**
 * Anatomical zones aligned to {@link VEHICLE_CAR_PATHS}.
 * Keys match DashboardRegion.id.
 */
export const REGION_DIAGRAM_META: Record<string, RegionDiagramMeta> = {
  battery: {
    hitPath:
      "M148 148 L208 140 L218 168 L208 188 L152 192 L142 168 Z",
    center: { x: 178, y: 166 },
    callout: { x: 72, y: 128 },
  },
  brakes: {
    hitPath:
      "M218 252 C232 244 252 244 266 252 C274 264 266 280 248 286 C230 286 214 274 218 252 Z M498 252 C512 244 532 244 546 252 C554 264 546 280 528 286 C510 286 494 274 498 252 Z",
    center: { x: 380, y: 268 },
    callout: { x: 380, y: 338 },
  },
  suspension: {
    hitPath:
      "M548 158 L612 152 L628 188 L618 218 L560 222 L542 190 Z",
    center: { x: 582, y: 186 },
    callout: { x: 698, y: 150 },
  },
  engine: {
    hitPath:
      "M210 138 L320 126 L400 130 L420 158 L400 178 L280 182 L210 170 Z",
    center: { x: 310, y: 152 },
    callout: { x: 300, y: 58 },
  },
  tires: {
    hitPath:
      "M202 278a38 38 0 1 0 76 0a38 38 0 1 0-76 0M482 278a38 38 0 1 0 76 0a38 38 0 1 0-76 0",
    center: { x: 380, y: 300 },
    callout: { x: 180, y: 338 },
  },
  hvac: {
    hitPath:
      "M280 122 L420 116 L500 132 L488 154 L400 148 L290 152 Z",
    center: { x: 390, y: 134 },
    callout: { x: 470, y: 52 },
  },
  transmission: {
    hitPath:
      "M300 198 L460 192 L490 214 L460 236 L310 240 L285 218 Z",
    center: { x: 390, y: 216 },
    callout: { x: 560, y: 248 },
  },
  lights: {
    hitPath:
      "M122 188 L158 176 L168 200 L152 218 L124 212 Z M612 168 L648 160 L658 184 L640 202 L608 192 Z",
    center: { x: 390, y: 180 },
    callout: { x: 72, y: 210 },
  },
};
