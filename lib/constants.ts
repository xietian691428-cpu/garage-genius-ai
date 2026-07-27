import type { ChatMessage, VehicleInfo } from "@/lib/types/chat";
import { LEGAL_DISCLAIMER_EN } from "@/lib/legal-disclaimer";

/** @deprecated Prefer LEGAL_DISCLAIMER_EN / i18n `legal.disclaimer` — kept as alias. */
export const DISCLAIMER = LEGAL_DISCLAIMER_EN;

const WELCOME_CONTENT =
  "Hello! I'm Garage Genius AI — your DIY repair coach.\n\n**How we'll work:** diagnose → suggest checks (photo/OBD) → recommend parts to buy → verify the fix.\n\nSnap a photo, type a symptom, or use voice (Pro). Your vehicle profile and maintenance history stay in context across turns.";

/** 在客户端创建欢迎消息，避免 SSR 时间戳不一致 */
export function createWelcomeMessage(): ChatMessage {
  return {
    id: "welcome",
    role: "assistant",
    content: WELCOME_CONTENT,
    timestamp: new Date(),
  };
}

export const DEFAULT_VEHICLE: VehicleInfo = {
  id: "default",
  name: "My Main Car",
  year: 2018,
  make: "Toyota",
  model: "Camry",
  submodel: "SE",
  market: "US",
  mileage: 85000,
  engine: "2.5L L4 NA GAS",
  transmission: "8 Transaxle Automatic",
  driveType: "FWD",
  brakes: "front Disc, rear Disc, ABS: 4-Wheel ABS",
  fuelGrade: "Regular 87 (AKI)",
  oilCapacity: "4.8 qt with filter",
  oilViscosity: "0W-16",
  lastMaintenance: "2025-05-01",
  tags: ["Daily Driver", "VCdb matched"],
  vcdb: {
    source: "vcdb",
    vehicleId: 248942,
    year: 2018,
    make: "Toyota",
    model: "Camry",
    submodel: "SE",
    engine: "2.5L L4 NA GAS",
    transmission: "8 Transaxle Automatic",
    driveType: "FWD",
    brakes: "front Disc, rear Disc, ABS: 4-Wheel ABS",
    fuelGrade: "Regular 87 (AKI)",
    oilCapacity: "4.8 qt with filter",
    oilViscosity: "0W-16",
    summary:
      "2018 Toyota Camry SE · 2.5L L4 NA GAS · Regular 87 · 4.8 qt 0W-16 · 8 Transaxle Automatic · FWD",
    matchedAt: "2026-07-13T00:00:00.000Z",
  },
};
