import { formatLimitedQuotaReply } from "@/lib/ai-cost/gate";

export function formatAiHttpError(input: {
  status: number;
  code?: string | null;
  error?: string | null;
  fallback?: string;
  /** Prefer i18n `ai.rateLimited` from callers. */
  rateLimitFallback?: string;
  /** Prefer i18n `shopReport.limitReached` from callers. */
  reportLimitFallback?: string;
}): string {
  const code = (input.code || "").toLowerCase();
  const server = (input.error || "").trim();
  const isRateLimit =
    input.status === 429 ||
    code.startsWith("rate_limit") ||
    code === "rate_limit";
  const isReportLimit =
    code === "report_limit_reached" || code === "report_limit";
  const isTokenLimit =
    input.status === 402 &&
    (code === "insufficient_tokens" ||
      code === "token_limit" ||
      code === "ai_budget_exceeded");
  const isVisionQuota =
    code === "vision_quota_exceeded" ||
    (input.status === 429 && code === "vision_quota_exceeded");

  if (isVisionQuota) {
    const raw =
      server ||
      input.fallback ||
      "Monthly photo analysis limit reached. Upgrade for a higher photo quota.";
    return formatLimitedQuotaReply(raw);
  }

  if (isRateLimit) {
    if (server) {
      if (/wait|try again|later|tomorrow|espera|inténtalo|momento/i.test(server))
        return server;
      const hint =
        input.rateLimitFallback ||
        "Please wait a moment and try again.";
      return `${server} ${hint}`;
    }
    return (
      input.rateLimitFallback ||
      "Too many requests. Please wait a moment and try again."
    );
  }

  if (isReportLimit) {
    return (
      input.reportLimitFallback ||
      server ||
      "Monthly shop report limit reached. Try again next month."
    );
  }

  if (isTokenLimit) {
    if (code === "ai_budget_exceeded") {
      const raw =
        server ||
        input.fallback ||
        "This month's AI allowance is used up. Upgrade for a larger budget.";
      return formatLimitedQuotaReply(raw);
    }
    return (
      server ||
      input.fallback ||
      "Insufficient tokens this month. Try again next month."
    );
  }

  if (
    code === "vehicle_not_owned" ||
    code === "vehicle_selection_mismatch"
  ) {
    return (
      server ||
      input.fallback ||
      "Vehicle selection changed. Refresh chat and try again."
    );
  }

  return server || input.fallback || "Request failed. Please try again.";
}
