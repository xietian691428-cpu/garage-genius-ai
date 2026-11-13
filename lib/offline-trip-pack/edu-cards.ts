/**
 * Static observation cards for Offline Trip Pack.
 * Extracted themes only — does NOT import CoachScenarioPlayer or playbook engines.
 */

import type { TripPackEduCard } from "@/lib/offline-trip-pack/types";

export const TRIP_PACK_EDU_CARDS: TripPackEduCard[] = [
  {
    id: "overheat_observe",
    title: "Overheating (observe only)",
    steps: [
      "If steam or a red temperature gauge: pull over safely when you can.",
      "Do not open a hot radiator or pressurized coolant cap.",
      "After the engine is fully cool, you may check the cold reservoir level visually.",
      "Arrange a tow / professional help if steam continues or the gauge stays high.",
    ],
    stopIf:
      "Steam, red gauge while driving, or you cannot safely stop — do not keep driving to “make it”.",
  },
  {
    id: "soft_brake_observe",
    title: "Soft brake pedal / brake warning",
    steps: [
      "Treat a soft/spongy pedal or brake warning light as do-not-drive education.",
      "Arrange a tow. Do not limp to a shop if brakes may be failing.",
      "Cold reservoir sight level only if visible — do not open lines or bleed brakes.",
    ],
    stopIf: "Soft pedal, pedal to the floor, or brake warning light on.",
  },
  {
    id: "flat_tire_observe",
    title: "Flat or low tire (education)",
    steps: [
      "Move to a safe area away from traffic when possible.",
      "Use the door placard PSI and a gauge when cold — do not invent pressures.",
      "If you lack a spare, jack, or skill: call roadside assistance instead of roadside DIY.",
    ],
    stopIf: "Unstable shoulder, heavy traffic, or no safe jack points — call for help.",
  },
  {
    id: "battery_jump_observe",
    title: "Battery / no-crank (education)",
    steps: [
      "Note no-crank vs slow-crank vs clicks, and whether lights/accessories dim — before parts talk.",
      "Jump-start only with correct polarity and away from airbag modules if unsure.",
      "This is not a “replace battery now” diagnosis — a shop can load-test safely. Do not invent CCA.",
    ],
    stopIf: "Smell of sulfur, hot/swollen battery, or hybrid/EV orange cabling — stop DIY.",
  },
  {
    id: "misfire_observe",
    title: "Misfire / flashing CEL (education)",
    steps: [
      "If flashing MIL or hard shake — reduce load; do not keep driving hard.",
      "Record codes (P0300 / P030x) before clearing; note recent fuel fill / bad-gas clues.",
      "Shared vacuum leaks, then coils/plugs — educational only; never Replace all coils now.",
    ],
    stopIf: "Flashing CEL, hard shake in traffic, or raw-fuel smell — stop aggressive driving; shop / tow as needed.",
  },
];
