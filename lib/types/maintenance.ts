export type MaintenanceCategory =
  | "general"
  | "oil"
  | "brakes"
  | "tires"
  | "engine"
  | "electrical"
  | "suspension"
  | "filter"
  | "other";

export type MaintenanceSource = "manual" | "chat" | "parts";

export type MaintenanceRecord = {
  id: string;
  userId: string;
  vehicleId: string;
  title: string;
  category: MaintenanceCategory | string;
  description?: string;
  mileage?: number;
  /** USD cents */
  costCents?: number;
  partsUsed?: unknown[];
  performedAt: string; // YYYY-MM-DD
  source: MaintenanceSource;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type MaintenanceRecordInput = {
  vehicleId: string;
  title: string;
  category?: string;
  description?: string;
  mileage?: number;
  costCents?: number;
  partsUsed?: unknown[];
  performedAt: string;
  source?: MaintenanceSource;
  notes?: string;
};
