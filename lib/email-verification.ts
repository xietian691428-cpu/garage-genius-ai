import type { User } from "@supabase/supabase-js";

/**
 * Email confirmation gate.
 * Default ON. Set REQUIRE_EMAIL_VERIFICATION=0 only for local/staging escapes.
 */
export function isEmailVerificationRequired(): boolean {
  const raw = process.env.REQUIRE_EMAIL_VERIFICATION?.trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "no") return false;
  return true;
}

/** True when the user may use gated product features. */
export function isUserEmailVerified(user: User | null | undefined): boolean {
  if (!user) return false;
  if (!isEmailVerificationRequired()) return true;
  if (user.email_confirmed_at) return true;
  // Some Supabase payloads expose confirmed_at
  const confirmedAt = (user as { confirmed_at?: string | null }).confirmed_at;
  return Boolean(confirmedAt);
}
