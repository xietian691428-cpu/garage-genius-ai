/**
 * Client-safe identity of the primary smoke-test account.
 * Do not import server-only modules from here.
 */

const LONG_LIVED_QA_TRIAL_EMAILS = ["18565006079@163.com"] as const;

/** Far-future hold written on the QA profile so DB triggers / RPC also stay trial. */
export const LONG_LIVED_QA_TRIAL_ENDS_AT = "2099-12-31T23:59:59.000Z";

export function isLongLivedQaTrialEmail(email?: string | null): boolean {
  if (!email) return false;
  return (LONG_LIVED_QA_TRIAL_EMAILS as readonly string[]).includes(
    email.trim().toLowerCase(),
  );
}
