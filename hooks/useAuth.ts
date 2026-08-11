"use client";

import { useCallback, useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { safeNextPath } from "@/lib/safe-next-path";
import { isUserEmailVerified } from "@/lib/email-verification";
import {
  AUTH_OAUTH_TIMEOUT_MS,
  AUTH_SESSION_TIMEOUT_MS,
  AUTH_SIGNIN_TIMEOUT_MS,
  TimeoutError,
  withTimeout,
} from "@/lib/auth-timeout";
import { isNativeCapacitor } from "@/lib/native-platform";

export type OAuthProvider = "apple" | "google";

export type AuthView = {
  user: User | null;
  session: Session | null;
  loading: boolean;
};

function oauthRedirectTo(next?: string | null): string | undefined {
  if (typeof window === "undefined") return undefined;
  const path = safeNextPath(next);
  // Native: custom scheme so SFSafariViewController / ASWebAuthentication can return
  if (isNativeCapacitor()) {
    const url = new URL("garagegenius://auth/callback");
    if (path !== "/app") url.searchParams.set("next", path);
    return url.toString();
  }
  const url = new URL("/auth/callback", window.location.origin);
  if (path !== "/app") url.searchParams.set("next", path);
  return url.toString();
}

function friendlyAuthError(err: unknown): Error {
  if (err instanceof TimeoutError) return err;
  if (err instanceof Error) {
    const msg = err.message || "Authentication failed.";
    if (/failed to fetch|networkerror|load failed|network request failed/i.test(msg)) {
      return new Error(
        "Network error. Check your connection and try again.",
      );
    }
    if (/invalid login credentials/i.test(msg)) {
      return new Error("Invalid email or password.");
    }
    if (/email not confirmed/i.test(msg)) {
      return new Error(
        "Email not verified yet. Check your inbox (and spam) for the confirmation link.",
      );
    }
    return new Error(msg);
  }
  return new Error("Authentication failed.");
}

/**
 * App auth for web + Capacitor iOS/Android wrappers.
 * Primary: email + password. Session bootstrap always times out so the UI never freezes.
 */
export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const finish = (next: Session | null) => {
      if (!mounted) return;
      setSession(next);
      setUser(next?.user ?? null);
      setLoading(false);
    };

    void (async () => {
      try {
        if (!isSupabaseConfigured()) {
          console.warn("[auth] Supabase env not configured");
          finish(null);
          return;
        }
        const { data, error } = await withTimeout(
          supabase.auth.getSession(),
          AUTH_SESSION_TIMEOUT_MS,
          "Signing in is taking too long. Please try again.",
        );
        if (error) console.warn("[auth] getSession:", error.message);
        finish(data.session);
      } catch (err) {
        console.warn("[auth] getSession failed/timed out", err);
        finish(null);
      }
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      // Keep callback synchronous — awaiting Supabase here can deadlock getSession.
      finish(nextSession);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    try {
      const { data, error } = await withTimeout(
        supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        }),
        AUTH_SIGNIN_TIMEOUT_MS,
        "Sign-in timed out. Check your connection and try again.",
      );
      if (error) throw error;
      return data;
    } catch (err) {
      throw friendlyAuthError(err);
    }
  }, []);

  const signUpWithEmail = useCallback(async (email: string, password: string) => {
    try {
      const { data, error } = await withTimeout(
        supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: oauthRedirectTo("/app"),
          },
        }),
        AUTH_SIGNIN_TIMEOUT_MS,
        "Sign-up timed out. Check your connection and try again.",
      );
      if (error) throw error;
      return data;
    } catch (err) {
      throw friendlyAuthError(err);
    }
  }, []);

  const resendVerificationEmail = useCallback(
    async (email?: string) => {
      const target = (email ?? user?.email ?? "").trim();
      if (!target) throw new Error("Email is required to resend verification.");
      try {
        const { error } = await withTimeout(
          supabase.auth.resend({
            type: "signup",
            email: target,
            options: {
              emailRedirectTo: oauthRedirectTo("/app"),
            },
          }),
          AUTH_SIGNIN_TIMEOUT_MS,
          "Resend timed out. Please try again.",
        );
        if (error) throw error;
      } catch (err) {
        throw friendlyAuthError(err);
      }
    },
    [user?.email],
  );

  const refreshUser = useCallback(async () => {
    try {
      const { data, error } = await withTimeout(
        supabase.auth.getUser(),
        AUTH_SESSION_TIMEOUT_MS,
        "Could not refresh account. Please try again.",
      );
      if (error) throw error;
      setUser(data.user);
      return data.user;
    } catch (err) {
      throw friendlyAuthError(err);
    }
  }, []);

  /**
   * Starts OAuth (PKCE). Web: full-page redirect. Native: Capacitor Browser.
   */
  const signInWithOAuth = useCallback(
    async (provider: OAuthProvider, next?: string | null) => {
      const redirectTo = oauthRedirectTo(next);
      const native = isNativeCapacitor();
      try {
        const { data, error } = await withTimeout(
          supabase.auth.signInWithOAuth({
            provider,
            options: {
              redirectTo,
              skipBrowserRedirect: native,
              ...(provider === "apple"
                ? {
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
          }),
          AUTH_OAUTH_TIMEOUT_MS,
          "Could not start social sign-in. Please use email instead.",
        );
        if (error) {
          if (/provider is not enabled|unsupported provider/i.test(error.message)) {
            console.warn(
              `[auth] ${provider} OAuth provider not enabled — configure in Supabase (docs/AUTH_PROVIDERS.md).`,
              error.message,
            );
            throw new Error(
              provider === "apple"
                ? "Sign in with Apple is temporarily unavailable. Please use email instead."
                : "Google sign-in is temporarily unavailable. Please use email instead.",
            );
          }
          throw new Error(error.message);
        }

        if (native && data?.url) {
          const { Browser } = await import("@capacitor/browser");
          await Browser.open({ url: data.url, presentationStyle: "popover" });
        }

        return data;
      } catch (err) {
        throw friendlyAuthError(err);
      }
    },
    [],
  );

  const signOut = useCallback(async () => {
    try {
      const { error } = await withTimeout(
        supabase.auth.signOut(),
        AUTH_SESSION_TIMEOUT_MS,
        "Sign-out timed out. Please try again.",
      );
      if (error) throw error;
    } catch (err) {
      throw friendlyAuthError(err);
    }
  }, []);

  return {
    user,
    session,
    loading,
    isAuthenticated: Boolean(user),
    isEmailVerified: isUserEmailVerified(user),
    signInWithEmail,
    signUpWithEmail,
    signInWithOAuth,
    resendVerificationEmail,
    refreshUser,
    signOut,
  };
}

export { safeNextPath, oauthRedirectTo };
