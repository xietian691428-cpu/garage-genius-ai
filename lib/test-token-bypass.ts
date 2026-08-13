/**
 * Per-email unlimited token bypass for internal test accounts.
 *
 * Unlike NEXT_PUBLIC_QA_UNLOCK (blocked on Vercel Production), this only
 * unlocks token budget for listed emails. Trial hold lives in qa-test-account.ts.
 *
 * Default includes the primary smoke-test account. Expand via:
 *   TEST_UNLIMITED_TOKEN_EMAILS=a@x.com,b@y.com
 */

import { createSupabaseAdmin } from "@/lib/supabase-admin";

export {
  isLongLivedQaTrialEmail,
  LONG_LIVED_QA_TRIAL_ENDS_AT,
} from "@/lib/qa-test-account";

/** Built-in smoke-test account — keep in sync with E2E / manual QA notes. */
const DEFAULT_UNLIMITED_TOKEN_EMAILS = ["18565006079@163.com"] as const;

function parseEmailList(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[,;\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function getUnlimitedTokenEmails(): Set<string> {
  const fromEnv = parseEmailList(process.env.TEST_UNLIMITED_TOKEN_EMAILS);
  return new Set([
    ...DEFAULT_UNLIMITED_TOKEN_EMAILS.map((e) => e.toLowerCase()),
    ...fromEnv,
  ]);
}

export function isUnlimitedTokenEmail(email?: string | null): boolean {
  if (!email) return false;
  return getUnlimitedTokenEmails().has(email.trim().toLowerCase());
}

/** Resolve profile/auth email for a user id (service role). */
export async function isUnlimitedTokenUser(userId: string): Promise<boolean> {
  if (!userId) return false;
  const admin = createSupabaseAdmin();
  const { data } = await admin
    .from("profiles")
    .select("email")
    .eq("id", userId)
    .maybeSingle();

  if (isUnlimitedTokenEmail(data?.email)) return true;

  // Fallback: auth.users when profiles.email is missing
  const { data: authData, error } = await admin.auth.admin.getUserById(userId);
  if (error || !authData?.user?.email) return false;
  return isUnlimitedTokenEmail(authData.user.email);
}
