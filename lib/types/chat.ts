import type { VcdbResolvedConfig } from "@/lib/types/vcdb";
import type { VehicleMarketCode } from "@/lib/types/vehicle-market";

export interface VehicleInfo {
  id: string;
  name: string; // 自定义名称，如 "我的日常通勤车"
  year: number;
  make: string;
  model: string;
  /** Trim / package (VCdb SubModel), e.g. SE, XLE */
  submodel?: string;
  /**
   * Sales-market / owner-manual version (USDM, EUDM, UKDM, …).
   * Specs, lighting, and manuals differ by country even for the same YMM.
   */
  market?: VehicleMarketCode;
  mileage: number;
  engine: string;
  transmission?: string;
  driveType?: string;
  brakes?: string;
  /** e.g. "Regular 87 (AKI)" — curated enrichment */
  fuelGrade?: string;
  /** e.g. "4.8 qt with filter" */
  oilCapacity?: string;
  /** e.g. "0W-16" */
  oilViscosity?: string;
  vin?: string;
  lastMaintenance?: string; // YYYY-MM-DD
  notes?: string;
  tags?: string[]; // 如 ["EV", "Modified", "Daily Driver"]
  /**
   * Optional insurance jurisdiction (e.g. "United States").
   * Education tips only — never used to adjudicate coverage.
   */
  countryRegion?: string;
  /** Optional US state / province for insurance tips. */
  countryState?: string;
  /** Optional insurer name for soft tip personalization. */
  insuranceProvider?: string;
  /** Authoritative AutoCare VCdb match when picked via cascade UI */
  vcdb?: VcdbResolvedConfig;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Primary / first attached photo (cloud column + legacy) */
  image?: string;
  /** Multi-photo diagnose (session UI; cloud persists `image` as first) */
  images?: string[];
  timestamp: Date;
}

/** Normalize single + multi photo fields for display / API. */
export function messageImages(message: Pick<ChatMessage, "image" | "images">): string[] {
  if (message.images?.length) return message.images.filter(Boolean);
  if (message.image) return [message.image];
  return [];
}
