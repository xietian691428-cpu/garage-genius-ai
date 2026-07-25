/** RAG hit shape returned by match_documents / text fallback */

export type RagKnowledgeHit = {
  id?: string;
  title: string;
  content: string;
  source?: string;
  category?: string;
  vehicle_make?: string;
  vehicle_model?: string;
  vehicle_years?: string;
  metadata?: Record<string, unknown>;
  similarity?: number;
};
