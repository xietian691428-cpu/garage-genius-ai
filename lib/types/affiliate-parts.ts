export const AFFILIATE_PART_CATEGORIES = [
  "brake",
  "engine",
  "filter",
  "suspension",
  "electrical",
  "consumable",
  "other",
] as const;

export type AffiliatePartCategory = (typeof AFFILIATE_PART_CATEGORIES)[number];

export type AffiliatePart = {
  id: string;
  oem_number: string;
  name: string;
  brand: string;
  category: AffiliatePartCategory;
  vehicle_make: string | null;
  vehicle_model: string | null;
  vehicle_years: string | null;
  price_min: number | null;
  price_max: number | null;
  amazon_url: string | null;
  rockauto_url: string | null;
  autozone_url: string | null;
  oreilly_url: string | null;
  other_urls: string[];
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type AffiliatePartInput = {
  oem_number: string;
  name: string;
  brand: string;
  category: AffiliatePartCategory;
  vehicle_make?: string;
  vehicle_model?: string;
  vehicle_years?: string;
  price_min?: number | null;
  price_max?: number | null;
  amazon_url?: string;
  rockauto_url?: string;
  autozone_url?: string;
  oreilly_url?: string;
  other_urls?: string[];
  notes?: string;
  is_active?: boolean;
};
