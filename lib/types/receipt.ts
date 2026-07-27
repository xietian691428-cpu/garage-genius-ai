import type { MaintenanceCategory } from "@/lib/types/maintenance";

/** Structured output from /api/vision/analyze-receipt */
export type ReceiptVisionAnalysis = {
  performedAt: string | null; // YYYY-MM-DD
  title: string | null;
  category: MaintenanceCategory | string | null;
  mileage: number | null;
  /** USD dollars (not cents) as shown on many invoices */
  costUsd: number | null;
  parts: string[];
  shopName: string | null;
  notes: string | null;
  confidence: "high" | "medium" | "low";
  raw_text_glimpse: string | null;
};

/** Editable draft before saving to maintenance_records */
export type ServiceRecordDraft = {
  vehicleId: string;
  title: string;
  category: string;
  performedAt: string;
  mileage: string;
  costUsd: string;
  partsText: string;
  shopName: string;
  notes: string;
  source: "manual" | "receipt";
};
