/**
 * Client-visible OAuth feature flags.
 * Buttons stay hidden unless explicitly enabled after Supabase providers are configured.
 *
 *   NEXT_PUBLIC_AUTH_APPLE=1
 *   NEXT_PUBLIC_AUTH_GOOGLE=1
 */

function envFlag(name: string): boolean {
  const raw = process.env[name]?.trim().toLowerCase() ?? "";
  return raw === "1" || raw === "true" || raw === "yes";
}

export function isAppleAuthEnabled(): boolean {
  return envFlag("NEXT_PUBLIC_AUTH_APPLE");
}

export function isGoogleAuthEnabled(): boolean {
  return envFlag("NEXT_PUBLIC_AUTH_GOOGLE");
}

export function hasAnyOAuthProvider(): boolean {
  return isAppleAuthEnabled() || isGoogleAuthEnabled();
}
