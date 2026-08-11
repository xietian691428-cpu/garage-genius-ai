"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { safeNextPath } from "@/lib/safe-next-path";
import {
  AUTH_SESSION_TIMEOUT_MS,
  withTimeout,
} from "@/lib/auth-timeout";
import { hideNativeSplash } from "@/lib/native-splash";
import { isNativeCapacitor } from "@/lib/native-platform";

/**
 * OAuth / magic-link return URL (PKCE).
 * Handles: ?code=, provider ?error=, hash tokens, and detectSessionInUrl race.
 * Always times out so reviewers never see a permanent hang.
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const [message, setMessage] = useState("Finishing sign-in…");

  useEffect(() => {
    let cancelled = false;
    void hideNativeSplash();

    void (async () => {
      try {
        if (isNativeCapacitor()) {
          try {
            const { Browser } = await import("@capacitor/browser");
            await Browser.close();
          } catch {
            /* ignore */
          }
        }

        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");
        const next = safeNextPath(url.searchParams.get("next"));
        const oauthError =
          url.searchParams.get("error_description") ||
          url.searchParams.get("error");

        if (oauthError) {
          throw new Error(decodeURIComponent(oauthError.replace(/\+/g, " ")));
        }

        if (code) {
          const { error } = await withTimeout(
            supabase.auth.exchangeCodeForSession(code),
            AUTH_SESSION_TIMEOUT_MS,
            "Sign-in timed out. Please try again.",
          );
          if (error) throw error;
        } else {
          let session = (
            await withTimeout(
              supabase.auth.getSession(),
              AUTH_SESSION_TIMEOUT_MS,
              "Sign-in timed out. Please try again.",
            )
          ).data.session;
          if (!session) {
            await new Promise((r) => setTimeout(r, 400));
            session = (
              await withTimeout(
                supabase.auth.getSession(),
                AUTH_SESSION_TIMEOUT_MS,
                "Sign-in timed out. Please try again.",
              )
            ).data.session;
          }
          if (!session) {
            throw new Error("No session found. Please try signing in again.");
          }
        }

        if (!cancelled) {
          window.history.replaceState({}, "", next);
          router.replace(next);
        }
      } catch (err) {
        if (!cancelled) {
          const text =
            err instanceof Error ? err.message : "Sign-in failed. Redirecting…";
          setMessage(text);
          const login = new URL("/login", window.location.origin);
          login.searchParams.set("error", text.slice(0, 180));
          setTimeout(() => router.replace(login.pathname + login.search), 1800);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[#0a0f1c] px-4 text-center text-slate-300">
      <p
        data-testid="auth-callback-status"
        className="rounded-2xl border border-slate-800 bg-[#111827] px-6 py-4 text-sm"
        role="status"
      >
        {message}
      </p>
      <Link href="/login" className="min-h-[44px] text-xs text-slate-500 underline">
        Back to sign in
      </Link>
    </div>
  );
}
