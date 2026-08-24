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
  withTimeout,
} from "@/lib/auth-timeout";
import { toUserFacingAuthError } from "@/lib/auth-errors";
import { getCapacitorPlatform, isNativeCapacitor, isNativeIos } from "@/lib/native-platform";
import {
  shouldUseNativeAppleSignIn,
  signInWithNativeApple,
} from "@/lib/native-apple-auth";

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

/**
 * App auth for web + Capacitor native wrappers.
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
      throw toUserFacingAuthError(err);
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
      throw toUserFacingAuthError(err);
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
        throw toUserFacingAuthError(err);
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
      throw toUserFacingAuthError(err);
    }
  }, []);

  /**
   * Social sign-in. iOS native Apple uses ASAuthorization (no PKCE Browser).
   * Web Apple/Google still use Supabase OAuth.
   */
  const signInWithOAuth = useCallback(
    async (provider: OAuthProvider, next?: string | null) => {
      try {
        if (
          provider === "apple" &&
          shouldUseNativeAppleSignIn({
            nativeCapacitor: isNativeCapacitor(),
            platform: getCapacitorPlatform(),
          })
        ) {
          await withTimeout(
            signInWithNativeApple(),
            AUTH_OAUTH_TIMEOUT_MS,
            "Could not start Sign in with Apple. Please use email instead.",
          );
          return { url: null, provider };
        }

        if (provider === "google" && isNativeIos()) {
          throw new Error(
            "Google sign-in is not available in the iOS app. Use Sign in with Apple or email.",
          );
        }

        const redirectTo = oauthRedirectTo(next);
        const native = isNativeCapacitor();
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
          await Browser.open({ url: data.url });
        }

        return data;
      } catch (err) {
        throw toUserFacingAuthError(err);
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
      throw toUserFacingAuthError(err);
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
