/**
 * Safe post-login relative path. Blocks open redirects (//evil, protocol URLs, etc.).
 */
export function safeNextPath(next?: string | null): string {
  if (!next) return "/app";

  let value = next.trim();
  try {
    value = decodeURIComponent(value);
  } catch {
    return "/app";
  }
  value = value.trim();

  if (!value.startsWith("/")) return "/app";
  if (value.startsWith("//")) return "/app";
  if (value.includes("://")) return "/app";
  if (value.includes("\\")) return "/app";
  if (value.includes("@")) return "/app";
  // Disallow control characters / CRLF injection
  if (/[\u0000-\u001f\u007f]/.test(value)) return "/app";

  return value || "/app";
}
