"use client";

import { useCallback, useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export type OAuthProvider = "apple" | "google";

export type AuthView = {
  user: User | null;
  session: Session | null;
  loading: boolean;
};

function safeNextPath(next?: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/app";
  return next;
}

function oauthRedirectTo(next?: string | null): string | undefined {
  if (typeof window === "undefined") return undefined;
  const path = safeNextPath(next);
  const url = new URL("/auth/callback", window.location.origin);
  if (path !== "/app") url.searchParams.set("next", path);
  return url.toString();
}

/**
 * App auth for web + future iOS/Android wrappers (Capacitor / store builds).
 * Primary: email + password.
 * Store compliance: Sign in with Apple (required when offering 3P login on iOS)
 * + Google Sign-In (optional / Android-friendly).
 */
export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) throw error;
    return data;
  }, []);

  const signUpWithEmail = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: oauthRedirectTo("/app"),
      },
    });
    if (error) throw error;
    return data;
  }, []);

  /**
   * Starts OAuth (PKCE). Browser redirects to the provider, then back to /auth/callback.
   * @param next post-login path (defaults to /app)
   */
  const signInWithOAuth = useCallback(
    async (provider: OAuthProvider, next?: string | null) => {
      const redirectTo = oauthRedirectTo(next);
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo,
          skipBrowserRedirect: false,
          ...(provider === "apple"
            ? {
                // Apple returns name only on the first consent; email always when permitted.
                scopes: "name email",
              }
            : {
                scopes: "openid email profile",
                queryParams: {
                  access_type: "offline",
                  prompt: "select_account",
                },
              }),
        },
      });
      if (error) {
        const hint =
          provider === "apple"
            ? " Enable Apple under Supabase → Authentication → Providers (see docs/AUTH_PROVIDERS.md)."
            : " Enable Google under Supabase → Authentication → Providers (see docs/AUTH_PROVIDERS.md).";
        throw new Error(
          `${error.message}${/provider is not enabled|unsupported provider/i.test(error.message) ? hint : ""}`,
        );
      }
      return data;
    },
    [],
  );

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }, []);

  return {
    user,
    session,
    loading,
    isAuthenticated: Boolean(user),
    signInWithEmail,
    signUpWithEmail,
    signInWithOAuth,
    signOut,
  };
}

export { safeNextPath, oauthRedirectTo };
