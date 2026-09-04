/**
 * Provider list prices used to stamp cost_usd on each usage event.
 * Conservative Kimi vision rates (slightly above public list) so we
 * do not under-meter. Override via env when contracts change.
 */

import { getTokenCostRates } from "@/lib/token-cost";

export type AiProvider = "deepseek" | "kimi" | "other";

export type ModelPrice = {
  provider: AiProvider;
  model: string;
  /** USD per 1M input/prompt tokens */
  inputPer1M: number;
  /** USD per 1M output/completion tokens */
  outputPer1M: number;
  /** Minimum USD charged per call (vision images). */
  perCallFloorUsd: number;
};

/** Seed / in-code catalog — mirrored in ai_model_prices. */
export const DEFAULT_MODEL_PRICES: ModelPrice[] = [
  {
    provider: "deepseek",
    model: "deepseek-chat",
    inputPer1M: 0.14,
    outputPer1M: 0.28,
    perCallFloorUsd: 0,
  },
  {
    provider: "deepseek",
    model: "deepseek-vision",
    inputPer1M: 0.14,
    outputPer1M: 0.28,
    perCallFloorUsd: 0,
  },
  {
    provider: "kimi",
    model: "kimi-k3",
    inputPer1M: 2.5,
    outputPer1M: 10,
    perCallFloorUsd: 0.012,
  },
];

export function inferAiProvider(model?: string | null): AiProvider {
  const m = (model || "").toLowerCase();
  if (/kimi|moonshot/.test(m)) return "kimi";
  if (/deepseek/.test(m)) return "deepseek";
  return "other";
}

function envNumber(name: string): number | null {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function resolveModelPrice(
  provider: AiProvider,
  model?: string | null,
): ModelPrice {
  const name = (model || "").toLowerCase();
  const listed =
    DEFAULT_MODEL_PRICES.find(
      (p) => p.provider === provider && p.model.toLowerCase() === name,
    ) ||
    DEFAULT_MODEL_PRICES.find((p) => p.provider === provider) ||
    DEFAULT_MODEL_PRICES[0];

  if (provider === "kimi") {
    return {
      ...listed,
      inputPer1M: envNumber("KIMI_COST_INPUT_PER_1M") ?? listed.inputPer1M,
      outputPer1M: envNumber("KIMI_COST_OUTPUT_PER_1M") ?? listed.outputPer1M,
      perCallFloorUsd:
        envNumber("KIMI_COST_PER_CALL_FLOOR") ?? listed.perCallFloorUsd,
    };
  }

  if (provider === "deepseek") {
    const rates = getTokenCostRates();
    return {
      ...listed,
      inputPer1M: rates.promptPer1M,
      outputPer1M: rates.completionPer1M,
    };
  }

  return listed;
}

export function estimateAiCostUsd(input: {
  provider?: AiProvider | null;
  model?: string | null;
  promptTokens: number;
  completionTokens: number;
  /** Apply per-call floor (default true for Kimi). */
  applyCallFloor?: boolean;
}): number {
  const provider = input.provider || inferAiProvider(input.model);
  const price = resolveModelPrice(provider, input.model);
  const prompt = Math.max(0, input.promptTokens);
  const completion = Math.max(0, input.completionTokens);
  const metered =
    (prompt / 1_000_000) * price.inputPer1M +
    (completion / 1_000_000) * price.outputPer1M;
  const applyFloor =
    input.applyCallFloor ?? (provider === "kimi" && price.perCallFloorUsd > 0);
  const cost = applyFloor ? Math.max(metered, price.perCallFloorUsd) : metered;
  return Math.round(cost * 1_000_000) / 1_000_000;
}

export function aiCostRateSummary(): {
  deepseek: { promptPer1M: number; completionPer1M: number };
  kimi: { promptPer1M: number; completionPer1M: number; perCallFloorUsd: number };
} {
  const ds = resolveModelPrice("deepseek", "deepseek-chat");
  const kimi = resolveModelPrice("kimi", "kimi-k3");
  return {
    deepseek: {
      promptPer1M: ds.inputPer1M,
      completionPer1M: ds.outputPer1M,
    },
    kimi: {
      promptPer1M: kimi.inputPer1M,
      completionPer1M: kimi.outputPer1M,
      perCallFloorUsd: kimi.perCallFloorUsd,
    },
  };
}
