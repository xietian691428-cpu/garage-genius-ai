import { TimeoutError } from "@/lib/auth-timeout";

/**
 * Map provider / JWT failures to copy that is safe to show on the login screen.
 * Never surface raw `aud` / client-id mismatches to App Review.
 */
export function toUserFacingAuthError(err: unknown): Error {
  if (err instanceof TimeoutError) return err;
  if (!(err instanceof Error)) {
    return new Error("Authentication failed.");
  }
  const msg = err.message || "Authentication failed.";
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(msg)) {
    return new Error("Network error. Check your connection and try again.");
  }
  if (/invalid login credentials/i.test(msg)) {
    return new Error("Invalid email or password.");
  }
  if (/email not confirmed/i.test(msg)) {
    return new Error(
      "Email not verified yet. Check your inbox (and spam) for the confirmation link.",
    );
  }
  if (/unacceptable audience|invalid audience|aud\b/i.test(msg)) {
    return new Error(
      "Sign in with Apple is temporarily unavailable. Please use email instead.",
    );
  }
  return new Error(msg);
}
