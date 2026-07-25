import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const ADMIN_SESSION_COOKIE = "gg_admin_session";

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

function getAdminCredentials() {
  const email = process.env.ADMIN_EMAIL?.trim();
  const password = getAdminPasswordFromEnv();
  if (!email || !password) {
    throw new Error(
      "Admin auth is not configured. Set ADMIN_EMAIL and ADMIN_PASSWORD_B64 (recommended) or ADMIN_PASSWORD in .env.local.",
    );
  }
  return { email, password };
}

function createSessionToken(email: string, password: string): string {
  return createHmac("sha256", password)
    .update(`garage-genius-admin:${email}`)
    .digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
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
    maxAge: 60 * 60 * 24 * 7, // 7 days
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
  | { configured: true; email: string; passwordLength: number; usesB64: boolean } {
  try {
    const { email, password } = getAdminCredentials();
    return {
      configured: true,
      email,
      passwordLength: password.length,
      usesB64: Boolean(process.env.ADMIN_PASSWORD_B64?.trim()),
    };
  } catch (err) {
    return {
      configured: false,
      reason: err instanceof Error ? err.message : "Not configured",
    };
  }
}
