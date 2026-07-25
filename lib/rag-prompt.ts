import type { RagKnowledgeHit } from "@/lib/types/rag";

/**
 * Prompt priority for retrieved knowledge (higher = show first / emphasize):
 *   1 config   — VCdb configuration cards / fitment ground truth
 *   2 evidence — real owner Q&A, NHTSA complaints/recalls, EPA (cite in coach replies)
 *   3 repair   — DIY steps, diagnostics, TSB-style guidance
 *   4 parts    — shopping / OEM / aftermarket notes
 */
export type RagPriorityTier = "config" | "evidence" | "repair" | "parts";

const TIER_RANK: Record<RagPriorityTier, number> = {
  config: 4,
  evidence: 3,
  repair: 2,
  parts: 1,
};

const TIER_LABEL: Record<RagPriorityTier, string> = {
  config: "CONFIG (highest weight — treat as ground truth for this vehicle)",
  evidence:
    "OWNER / SAFETY EVIDENCE (cite in coach replies — real owner reports, NHTSA, EPA)",
  repair: "REPAIR STEPS (follow when diagnosing / coaching DIY)",
  parts: "PARTS / FITMENT NOTES (use after config + diagnosis)",
};

function isOwnerOrSafetyEvidence(hit: RagKnowledgeHit): boolean {
  const src = (hit.source || "").toLowerCase();
  const cat = (hit.category || "").toLowerCase();
  const title = (hit.title || "").toLowerCase();
  const meta = hit.metadata || {};
  const corpus =
    typeof meta.corpus === "string" ? meta.corpus.toLowerCase() : "";
  const sourceLabel =
    typeof meta.source_label === "string"
      ? meta.source_label.toLowerCase()
      : "";

  if (meta.rag_tier === "evidence") return true;
  if (corpus === "owner_reviews" || corpus.includes("owner")) return true;
  if (src === "user_feedback" || src === "forum" || src === "nhtsa") return true;
  if (cat === "owner_review" || cat === "recall" || cat === "safety") return true;
  if (
    sourceLabel.includes("nhtsa") ||
    sourceLabel.includes("owner") ||
    sourceLabel.includes("epa") ||
    sourceLabel.includes("recall")
  ) {
    return true;
  }
  if (
    title.includes("nhtsa") ||
    title.includes("recall") ||
    title.includes("owner report") ||
    title.includes("owner-review") ||
    title.includes("fuel economy")
  ) {
    return true;
  }
  return false;
}

/** Classify a knowledge hit for prompt ordering and section headers */
export function classifyRagTier(hit: RagKnowledgeHit): RagPriorityTier {
  const cat = (hit.category || "").toLowerCase();
  const src = (hit.source || "").toLowerCase();
  const title = (hit.title || "").toLowerCase();
  const meta = hit.metadata || {};

  if (
    src === "vcdb_config" ||
    cat === "general" ||
    title.includes("configuration card") ||
    title.includes("authoritative configuration") ||
    meta.rag_tier === "config"
  ) {
    return "config";
  }

  if (
    cat === "parts" ||
    cat === "consumable" ||
    title.includes("fitment") ||
    title.includes("parts to buy") ||
    title.includes("shopping") ||
    meta.rag_tier === "parts"
  ) {
    return "parts";
  }

  if (isOwnerOrSafetyEvidence(hit)) {
    return "evidence";
  }

  // brake / engine / electrical / diagnostics / manual → repair
  return "repair";
}

/** Re-rank FTS/hybrid hits: config > repair > parts, then similarity */
export function prioritizeRagHits(hits: RagKnowledgeHit[]): RagKnowledgeHit[] {
  return [...hits].sort((a, b) => {
    const tierDiff =
      TIER_RANK[classifyRagTier(b)] - TIER_RANK[classifyRagTier(a)];
    if (tierDiff !== 0) return tierDiff;
    return (b.similarity ?? 0) - (a.similarity ?? 0);
  });
}

/**
 * Format FTS / hybrid hits for the chat system prompt.
 * Groups by priority so the model prefers config over parts.
 */
export function formatKnowledgeForPrompt(
  hits: RagKnowledgeHit[],
  maxChars = 6500,
  options?: { market?: string },
): string {
  if (!hits.length) return "";

  const ranked = prioritizeRagHits(hits);
  const byTier: Record<RagPriorityTier, RagKnowledgeHit[]> = {
    config: [],
    evidence: [],
    repair: [],
    parts: [],
  };
  for (const hit of ranked) {
    byTier[classifyRagTier(hit)].push(hit);
  }

  const blocks: string[] = [];
  let used = 0;
  let index = 0;

  const appendTier: RagPriorityTier[] = [
    "config",
    "evidence",
    "repair",
    "parts",
  ];
  const marketNote = options?.market
    ? `\nRetrieval preferred market: **${options.market}** (untagged / global docs allowed; wrong-market docs excluded).\n`
    : "";

  for (const tier of appendTier) {
    const group = byTier[tier];
    if (!group.length) continue;

    const sectionHeader = `\n### Priority: ${TIER_LABEL[tier]}\n`;
    if (used + sectionHeader.length > maxChars - 200) break;
    blocks.push(sectionHeader.trimEnd());
    used += sectionHeader.length;

    for (const hit of group) {
      index += 1;
      const sim =
        typeof hit.similarity === "number"
          ? ` · score ${hit.similarity.toFixed(4)}`
          : "";
      const header = `#### ${index}. [${tier.toUpperCase()}] ${hit.title || "Untitled"}${sim}`;
      const hitMarket =
        typeof hit.metadata?.market === "string"
          ? hit.metadata.market
          : typeof hit.metadata?.region === "string"
            ? hit.metadata.region
            : null;
      const corpus =
        typeof hit.metadata?.corpus === "string"
          ? hit.metadata.corpus
          : null;
      const sourceLabel =
        typeof hit.metadata?.source_label === "string"
          ? hit.metadata.source_label
          : null;
      const meta = [
        hit.source ? `Source: ${hit.source}` : null,
        corpus ? `Corpus: ${corpus}` : null,
        sourceLabel ? `Label: ${sourceLabel}` : null,
        hit.category ? `Category: ${hit.category}` : null,
        hitMarket ? `Market: ${hitMarket}` : null,
        hit.vehicle_make || hit.vehicle_model
          ? `Vehicle: ${[hit.vehicle_make, hit.vehicle_model, hit.vehicle_years]
              .filter(Boolean)
              .join(" ")}`
          : null,
      ]
        .filter(Boolean)
        .join(" | ");

      let body = (hit.content || "").trim();
      const room = maxChars - used - header.length - meta.length - 24;
      if (room < 180) break;
      if (body.length > room) {
        body = `${body.slice(0, room - 20)}…`;
      }

      const block = `${header}\n${meta}\n${body}`;
      blocks.push(block);
      used += block.length;
    }
  }

  return `## Retrieved Knowledge (FTS / Hybrid RAG)
Knowledge is ordered by priority: **configuration > owner/safety evidence > repair steps > parts**.${marketNote}
Rules when using these sources (Coach Mode):
1. Prefer **CONFIG** entries to lock fitment (engine / drive / brakes / transmission).
2. Use **EVIDENCE** (owner_reviews, NHTSA, EPA, recalls) as real-world support — cite naturally ("Owner reports…", "NHTSA data…").
3. Use **REPAIR** entries for DIY steps; stay aligned with the vehicle config card.
4. Use **PARTS** entries last — never override the authoritative config for drivetrain or engine.
5. Prefer hits whose Market matches the vehicle; ignore advice that conflicts with the vehicle Market / region context.
6. Mention the source title briefly when you rely on a hit. If none apply, say so and continue with best practice.

${blocks.join("\n\n")}`;
}
