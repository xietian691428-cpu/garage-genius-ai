export type KnowledgeEntry = {
  id: string;
  title: string;
  content: string;
  source: string;
  vehicle_make: string | null;
  vehicle_model: string | null;
  vehicle_years: string | null;
  category: string;
  metadata: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type KnowledgeInput = {
  title: string;
  content: string;
  source?: string;
  vehicle_make?: string;
  vehicle_model?: string;
  vehicle_years?: string;
  category?: string;
  is_active?: boolean;
};
