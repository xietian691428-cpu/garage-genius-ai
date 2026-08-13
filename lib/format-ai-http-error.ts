/**
 * Map API failure payloads to short, retryable user-facing copy.
 * Prefer the server message when present; guarantee a wait/retry hint for 429.
 */

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
    (code === "insufficient_tokens" || code === "token_limit");

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
      "Monthly shop report limit reached. Upgrade for unlimited reports, or wait until next month."
    );
  }

  if (isTokenLimit) {
    return (
      server ||
      input.fallback ||
      "Insufficient tokens this month. Top up or upgrade, or wait until next month."
    );
  }

  return server || input.fallback || "Request failed. Please try again.";
}
