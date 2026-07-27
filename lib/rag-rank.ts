/**
 * Soft RAG re-rank signals beyond DIY skill — vehicle fit, mileage band,
 * owner upvotes, flywheel quality. Never hard-excludes hits.
 */

import type { RagKnowledgeHit } from "@/lib/types/rag";
import type { DiySkillLevel } from "@/lib/diy-skill";
import { ragSkillBoost, normalizeDiySkill } from "@/lib/diy-skill";

export type RagRankContext = {
  diySkill?: DiySkillLevel | string | null;
  make?: string | null;
  model?: string | null;
  year?: number | null;
  mileage?: number | null;
};

function metaNum(meta: Record<string, unknown> | undefined, key: string): number | null {
  const v = meta?.[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) {
    return Number(v);
  }
  return null;
}

/** Soft boost for vehicle / mileage / feedback quality / golden promote. */
export function ragContextBoost(
  hit: RagKnowledgeHit,
  ctx?: RagRankContext | null,
): number {
  if (!ctx) return 0;
  let boost = 0;
  const make = (ctx.make || "").trim().toLowerCase();
  const model = (ctx.model || "").trim().toLowerCase();
  const hitMake = (hit.vehicle_make || "").trim().toLowerCase();
  const hitModel = (hit.vehicle_model || "").trim().toLowerCase();
  const meta = (hit.metadata || {}) as Record<string, unknown>;
  const src = (hit.source || "").toLowerCase();
  const corpus =
    typeof meta.corpus === "string" ? meta.corpus.toLowerCase() : "";

  // Vehicle soft match (universal / empty make stays neutral)
  if (make && hitMake) {
    if (hitMake === make) boost += 4;
    else if (hitMake.includes(make) || make.includes(hitMake)) boost += 2;
    else boost -= 2; // wrong make — soft demote, still keep
  }
  if (model && hitModel) {
    if (hitModel === model) boost += 3;
    else if (hitModel.includes(model) || model.includes(hitModel)) boost += 1;
  }
  if (!hitMake && !hitModel) boost += 0.5; // universal docs stay available

  // Year overlap via vehicle_years text or metadata
  const year = ctx.year;
  if (year && hit.vehicle_years) {
    const years = String(hit.vehicle_years);
    if (years.includes(String(year))) boost += 2;
    else {
      const m = years.match(/(\d{4})\s*[-–]\s*(\d{4})/);
      if (m) {
        const a = Number(m[1]);
        const b = Number(m[2]);
        if (year >= a && year <= b) boost += 2;
      }
    }
  }

  // Mileage band soft match (only when metadata declares a band)
  const mileage = ctx.mileage;
  if (mileage != null && mileage > 0) {
    const min = metaNum(meta, "mileage_min") ?? metaNum(meta, "odometer_min");
    const max = metaNum(meta, "mileage_max") ?? metaNum(meta, "odometer_max");
    if (min != null || max != null) {
      const lo = min ?? 0;
      const hi = max ?? 1_000_000;
      if (mileage >= lo && mileage <= hi) boost += 3;
      else boost -= 1;
    } else if (mileage >= 100_000 && /high.?mileage|worn|80k|100k/i.test(hit.title || "")) {
      boost += 1;
    }
  }

  // Feedback / quality signals already on rows
  const quality = metaNum(meta, "quality_score");
  if (quality != null) {
    boost += Math.min(5, Math.max(0, quality - 2)); // 5 → +3
  }
  const upvotes = metaNum(meta, "upvotes");
  if (upvotes != null && upvotes > 0) {
    boost += Math.min(4, Math.log10(upvotes + 1) * 2);
  }

  // Flywheel-promoted & high-value corpora
  if (src.includes("flywheel_golden") || corpus === "flywheel") boost += 5;
  if (corpus === "car_repair_qa" || corpus === "car_fault") boost += 1.5;
  if (corpus === "owner_reviews" && (upvotes ?? 0) >= 3) boost += 1;

  return boost;
}

export function combinedRagBoost(
  hit: RagKnowledgeHit,
  ctx?: RagRankContext | null,
): number {
  const skill = normalizeDiySkill(ctx?.diySkill || "enthusiast");
  return ragSkillBoost(hit, skill) + ragContextBoost(hit, ctx);
}
