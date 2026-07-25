/**
 * Provider cost estimates for DeepSeek (USD per 1M tokens).
 * Override via env when pricing changes.
 */

export type TokenCostRates = {
  /** USD per 1M prompt tokens */
  promptPer1M: number;
  /** USD per 1M completion tokens */
  completionPer1M: number;
};

const DEFAULT_RATES: TokenCostRates = {
  promptPer1M: 0.14,
  completionPer1M: 0.28,
};

export function getTokenCostRates(): TokenCostRates {
  const prompt = Number(process.env.TOKEN_COST_PROMPT_PER_1M);
  const completion = Number(process.env.TOKEN_COST_COMPLETION_PER_1M);
  return {
    promptPer1M:
      Number.isFinite(prompt) && prompt >= 0 ? prompt : DEFAULT_RATES.promptPer1M,
    completionPer1M:
      Number.isFinite(completion) && completion >= 0
        ? completion
        : DEFAULT_RATES.completionPer1M,
  };
}

export function estimateLlmCostUsd(input: {
  promptTokens: number;
  completionTokens: number;
  rates?: TokenCostRates;
}): number {
  const rates = input.rates ?? getTokenCostRates();
  const prompt = Math.max(0, input.promptTokens);
  const completion = Math.max(0, input.completionTokens);
  const cost =
    (prompt / 1_000_000) * rates.promptPer1M +
    (completion / 1_000_000) * rates.completionPer1M;
  return Math.round(cost * 1_000_000) / 1_000_000;
}

/** Blended estimate when only total tokens are known (~70% prompt / 30% completion). */
export function estimateLlmCostFromTotal(totalTokens: number): number {
  const prompt = Math.round(totalTokens * 0.7);
  const completion = Math.max(0, totalTokens - prompt);
  return estimateLlmCostUsd({ promptTokens: prompt, completionTokens: completion });
}
