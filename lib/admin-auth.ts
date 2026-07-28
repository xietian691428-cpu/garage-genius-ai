import { createHmac, timingSafeEqual, randomBytes } from "crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

export const ADMIN_SESSION_COOKIE = "gg_admin_session";

const MIN_ADMIN_PASSWORD_LENGTH = 12;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 5;

type AttemptState = { count: number; resetAt: number };
const loginAttempts = new Map<string, AttemptState>();

function getAdminPasswordFromEnv(): string {
  const b64 = process.env.ADMIN_PASSWORD_B64?.trim();
  if (b64) {
    try {
      return Buffer.from(b64, "base64").toString("utf8");
    } catch {
      throw new Error("ADMIN_PASSWORD_B64 is not valid base64.");
    }
  }

  // Plain text works only if password has no unescaped $ or # (see .env.local comments).
  return process.env.ADMIN_PASSWORD?.replace(/^["']|["']$/g, "") ?? "";
}

/** HMAC key for session cookie — prefer dedicated secret, never reuse a weak password alone. */
function getSessionSigningKey(password: string): string {
  const secret = process.env.ADMIN_SESSION_SECRET?.trim();
  if (secret && secret.length >= 16) return secret;
  // Derive a longer key from password so cookie isn't a trivial HMAC of a short pwd.
  return createHmac("sha256", "garage-genius-admin-session")
    .update(password)
    .digest("hex");
}

function getAdminCredentials() {
  const email = process.env.ADMIN_EMAIL?.trim();
  const password = getAdminPasswordFromEnv();
  if (!email || !password) {
    throw new Error(
      "Admin auth is not configured. Set ADMIN_EMAIL and ADMIN_PASSWORD_B64 (recommended) or ADMIN_PASSWORD in .env.local.",
    );
  }
  if (password.length < MIN_ADMIN_PASSWORD_LENGTH) {
    throw new Error(
      `Admin password must be at least ${MIN_ADMIN_PASSWORD_LENGTH} characters. Prefer ADMIN_PASSWORD_B64 + ADMIN_SESSION_SECRET.`,
    );
  }
  return { email, password };
}

function createSessionToken(email: string, password: string): string {
  const key = getSessionSigningKey(password);
  const nonce = process.env.ADMIN_SESSION_NONCE?.trim() || "v1";
  return createHmac("sha256", key)
    .update(`garage-genius-admin:${nonce}:${email.toLowerCase()}`)
    .digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function clientKey(email: string): string {
  // Best-effort IP from proxy headers (Vercel / reverse proxies).
  return email.trim().toLowerCase();
}

export function assertAdminLoginAllowed(email: string): void {
  const key = clientKey(email);
  const now = Date.now();
  const state = loginAttempts.get(key);
  if (!state) return;
  if (now >= state.resetAt) {
    loginAttempts.delete(key);
    return;
  }
  if (state.count >= LOGIN_MAX_ATTEMPTS) {
    const mins = Math.ceil((state.resetAt - now) / 60_000);
    throw new Error(
      `Too many failed admin login attempts. Try again in ~${mins} minute(s).`,
    );
  }
}

export function recordAdminLoginFailure(email: string): void {
  const key = clientKey(email);
  const now = Date.now();
  const state = loginAttempts.get(key);
  if (!state || now >= state.resetAt) {
    loginAttempts.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return;
  }
  state.count += 1;
}

export function clearAdminLoginFailures(email: string): void {
  loginAttempts.delete(clientKey(email));
}

export function verifyAdminCredentials(
  email: string,
  password: string,
): boolean {
  const creds = getAdminCredentials();
  return (
    safeEqual(email.trim().toLowerCase(), creds.email.toLowerCase()) &&
    safeEqual(password, creds.password)
  );
}

export async function createAdminSession(): Promise<void> {
  const { email, password } = getAdminCredentials();
  const token = createSessionToken(email, password);
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8, // 8 hours (was 7 days)
  });
}

export async function clearAdminSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_SESSION_COOKIE);
}

export async function isAdminAuthenticated(): Promise<boolean> {
  try {
    const { email, password } = getAdminCredentials();
    const expected = createSessionToken(email, password);
    const cookieStore = await cookies();
    const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
    if (!token) return false;
    return safeEqual(token, expected);
  } catch {
    return false;
  }
}

export async function requireAdmin(): Promise<void> {
  if (!(await isAdminAuthenticated())) {
    redirect("/admin/login");
  }
}

/** Dev-only: whether env credentials loaded (no secret values). */
export function getAdminAuthDebugInfo():
  | { configured: false; reason: string }
  | {
      configured: true;
      email: string;
      passwordLength: number;
      usesB64: boolean;
      hasSessionSecret: boolean;
      minPasswordLength: number;
    } {
  try {
    const { email, password } = getAdminCredentials();
    return {
      configured: true,
      email,
      passwordLength: password.length,
      usesB64: Boolean(process.env.ADMIN_PASSWORD_B64?.trim()),
      hasSessionSecret: Boolean(process.env.ADMIN_SESSION_SECRET?.trim()),
      minPasswordLength: MIN_ADMIN_PASSWORD_LENGTH,
    };
  } catch (err) {
    return {
      configured: false,
      reason: err instanceof Error ? err.message : "Not configured",
    };
  }
}

/** Optional: generate a strong session secret for ops docs. */
export function generateAdminSessionSecretHint(): string {
  return randomBytes(32).toString("hex");
}

/** Read client IP for logging (not used as sole rate-limit key). */
export async function getRequestIpHint(): Promise<string> {
  try {
    const h = await headers();
    return (
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      h.get("x-real-ip") ||
      "unknown"
    );
  } catch {
    return "unknown";
  }
}
