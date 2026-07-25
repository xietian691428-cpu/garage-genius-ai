import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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
 * Browser Supabase client — used by web and future Capacitor iOS/Android shells.
 * Persist session in localStorage so store WebViews keep users signed in.
 */
export const supabase: SupabaseClient = createClient(
  supabaseUrl || BUILD_PLACEHOLDER_URL,
  supabaseAnonKey || BUILD_PLACEHOLDER_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: "pkce",
    },
  },
);

export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseAnonKey);
}
