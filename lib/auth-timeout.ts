/**
 * Promise timeout helper for auth / network calls that can hang in WKWebView.
 */
export class TimeoutError extends Error {
  constructor(message = "Request timed out. Please try again.") {
    super(message);
    this.name = "TimeoutError";
  }
}

export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message?: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  }) as Promise<T>;
}

/** Default budgets for Capacitor / flaky mobile networks */
export const AUTH_SESSION_TIMEOUT_MS = 12_000;
export const AUTH_SIGNIN_TIMEOUT_MS = 20_000;
/** Browser OAuth kickoff (redirect / Browser.open) */
export const AUTH_OAUTH_TIMEOUT_MS = 15_000;
/**
 * Native Sign in with Apple includes the system sheet — reviewers often take
 * longer than 15s. Do not race the sheet with a short timeout or the UI shows
 * failure while Apple is still open / session is still writing.
 */
export const AUTH_NATIVE_APPLE_TIMEOUT_MS = 120_000;
/** First-paint garage / profile fetches after sign-in */
export const GARAGE_LOAD_TIMEOUT_MS = 15_000;
export const PROFILE_LOAD_TIMEOUT_MS = 12_000;
