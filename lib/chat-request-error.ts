/**
 * Client-facing Chat / AI error codes (gate vs upstream).
 */

export type ChatClientErrorCode =
  | "gate"
  | "rag_degraded"
  | "timeout"
  | "network"
  | "quota"
  | "upstream"
  | "empty"
  | "aborted"
  | "unknown";

export type ChatClientError = {
  code: ChatClientErrorCode;
  message: string;
};

export function classifyChatFetchError(err: unknown): ChatClientError {
  if (err instanceof DOMException && err.name === "AbortError") {
    return { code: "aborted", message: err.message || "Aborted" };
  }
  const message = err instanceof Error ? err.message : String(err || "Unknown error");
  const lower = message.toLowerCase();
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(message)) {
    return { code: "network", message };
  }
  if (/timed out|timeout/i.test(lower)) {
    return { code: "timeout", message };
  }
  if (/quota|token/i.test(lower)) {
    return { code: "quota", message };
  }
  if (/empty reply|empty content/i.test(lower)) {
    return { code: "empty", message };
  }
  return { code: "upstream", message };
}

export function formatChatClientError(err: ChatClientError): string {
  if (err.code === "gate") return err.message;
  if (err.code === "rag_degraded") {
    return `${err.message} (knowledge search ran in text-only mode)`;
  }
  if (err.code === "timeout") return err.message;
  if (err.code === "network") {
    return err.message.includes("Failed to fetch")
      ? "Network error — check connection and try again."
      : err.message;
  }
  return err.message;
}
