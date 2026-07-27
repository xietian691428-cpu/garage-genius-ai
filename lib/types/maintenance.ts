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

export type MaintenanceSource = "manual" | "chat" | "parts" | "receipt";

export type MaintenancePartUsed = {
  name: string;
  qty?: number;
  oem?: string;
};

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
  partsUsed?: MaintenancePartUsed[] | unknown[];
  /** Shop / dealer from receipt or manual entry */
  shopName?: string;
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
  partsUsed?: MaintenancePartUsed[] | unknown[];
  shopName?: string;
  performedAt: string;
  source?: MaintenanceSource;
  notes?: string;
};

export type MaintenanceRecordUpdate = Partial<
  Omit<MaintenanceRecordInput, "vehicleId">
> & { vehicleId?: string };

export const MAINTENANCE_CATEGORIES: MaintenanceCategory[] = [
  "general",
  "oil",
  "brakes",
  "tires",
  "engine",
  "electrical",
  "suspension",
  "filter",
  "other",
];
