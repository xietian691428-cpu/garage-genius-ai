/**
 * Typed DeepSeek / AI upstream errors for API routes + logging.
 */

export type AiUpstreamErrorCode =
  | "timeout"
  | "rate_limit"
  | "server_error"
  | "auth"
  | "bad_request"
  | "empty"
  | "network"
  | "config"
  | "insufficient_balance"
  | "unknown";

export class DeepSeekRequestError extends Error {
  readonly code: AiUpstreamErrorCode;
  readonly status?: number;
  readonly retryable: boolean;
  readonly attempt?: number;

  constructor(
    message: string,
    options: {
      code: AiUpstreamErrorCode;
      status?: number;
      retryable?: boolean;
      attempt?: number;
      cause?: unknown;
    },
  ) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "DeepSeekRequestError";
    this.code = options.code;
    this.status = options.status;
    this.retryable = options.retryable ?? false;
    this.attempt = options.attempt;
  }
}

export function isDeepSeekRequestError(
  err: unknown,
): err is DeepSeekRequestError {
  return err instanceof DeepSeekRequestError;
}

/** Map upstream AI failures to a stable JSON API response. */
export function aiUpstreamResponse(error: unknown): Response | null {
  if (!isDeepSeekRequestError(error)) return null;

  const status =
    error.code === "rate_limit"
      ? 429
      : error.code === "auth" || error.code === "insufficient_balance"
        ? 402
        : error.code === "bad_request"
          ? 400
          : error.code === "timeout"
            ? 504
            : 502;

  const userMessage =
    error.code === "timeout"
      ? "AI request timed out. Please try again."
      : error.code === "rate_limit"
        ? "AI is rate-limited right now. Please wait a moment and try again."
        : error.code === "insufficient_balance"
          ? "AI service is temporarily unavailable. Please try again later or contact support."
          : error.code === "empty"
            ? "AI returned an empty reply. Please try again."
            : error.code === "config"
              ? "AI service is temporarily unavailable. Please contact support."
              : "AI service is temporarily unavailable. Please try again.";

  console.error("[ai-upstream]", {
    code: error.code,
    status: error.status,
    attempt: error.attempt,
    retryable: error.retryable,
    message: error.message,
  });

  return Response.json(
    {
      error: userMessage,
      code: error.code.toUpperCase(),
      retryable: error.retryable,
    },
    { status },
  );
}
