/**
 * Map API failure payloads to short, retryable user-facing copy.
 * Prefer the server message when present; guarantee a wait/retry hint for 429.
 */

export function formatAiHttpError(input: {
  status: number;
  code?: string | null;
  error?: string | null;
  fallback?: string;
}): string {
  const code = (input.code || "").toLowerCase();
  const server = (input.error || "").trim();
  const isRateLimit =
    input.status === 429 ||
    code.startsWith("rate_limit") ||
    code === "rate_limit";

  if (isRateLimit) {
    if (server) {
      // Ensure a wait/retry cue even if upstream omitted it.
      if (/wait|try again|later|tomorrow/i.test(server)) return server;
      return `${server} Please wait a moment and try again.`;
    }
    return "Too many requests. Please wait a moment and try again.";
  }

  return server || input.fallback || "Request failed. Please try again.";
}
