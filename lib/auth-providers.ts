/**
 * Client-visible OAuth feature flags.
 * Buttons stay hidden unless explicitly enabled after Supabase providers are configured.
 *
 *   NEXT_PUBLIC_AUTH_APPLE=1
 *   NEXT_PUBLIC_AUTH_GOOGLE=1
 *
 * IMPORTANT: Next.js only inlines NEXT_PUBLIC_* when accessed as a static property
 * (`process.env.NEXT_PUBLIC_FOO`). Dynamic `process.env[name]` is empty in the browser.
 */

function flag(raw: string | undefined): boolean {
  const v = raw?.trim().toLowerCase() ?? "";
  return v === "1" || v === "true" || v === "yes";
}

export function isAppleAuthEnabled(): boolean {
  return flag(process.env.NEXT_PUBLIC_AUTH_APPLE);
}

export function isGoogleAuthEnabled(): boolean {
  return flag(process.env.NEXT_PUBLIC_AUTH_GOOGLE);
}

export function hasAnyOAuthProvider(): boolean {
  return isAppleAuthEnabled() || isGoogleAuthEnabled();
}
