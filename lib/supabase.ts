import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createAuthStorage } from "@/lib/auth-storage";
import { isNativeCapacitor } from "@/lib/native-platform";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";

/**
 * Placeholder values keep `next build` / Vercel compile alive when env vars
 * are not yet configured. Runtime auth still requires real Project URL + anon key.
 */
const BUILD_PLACEHOLDER_URL = "https://placeholder.supabase.co";
const BUILD_PLACEHOLDER_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.placeholder";

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "[supabase] NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY missing — using build placeholders. Set them in Vercel Project Settings → Environment Variables.",
  );
}

/**
 * Browser / Capacitor Supabase client.
 * Explicit localStorage avoids WKWebView cookie/session stalls on iOS/iPadOS.
 * On native shells, disable detectSessionInUrl — OAuth returns via deep link bridge.
 */
function buildClient(): SupabaseClient {
  const native =
    typeof window !== "undefined" ? isNativeCapacitor() : false;

  return createClient(
    supabaseUrl || BUILD_PLACEHOLDER_URL,
    supabaseAnonKey || BUILD_PLACEHOLDER_KEY,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: !native,
        flowType: "pkce",
        storage: createAuthStorage(),
        storageKey: "garage-genius-auth",
      },
    },
  );
}

export const supabase: SupabaseClient = buildClient();

export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseAnonKey);
}
