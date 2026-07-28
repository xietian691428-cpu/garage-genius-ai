"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { safeNextPath } from "@/lib/safe-next-path";

/**
 * OAuth / magic-link return URL (PKCE).
 * Handles: ?code=, provider ?error=, hash tokens, and detectSessionInUrl race.
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const [message, setMessage] = useState("Finishing sign-in…");

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
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
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else {
          // Implicit / hash fragment — client may still be parsing the URL
          let session = (await supabase.auth.getSession()).data.session;
          if (!session) {
            await new Promise((r) => setTimeout(r, 400));
            session = (await supabase.auth.getSession()).data.session;
          }
          if (!session) {
            throw new Error("No session found. Please try signing in again.");
          }
        }

        if (!cancelled) {
          // Strip auth params from history before entering the app
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
          setTimeout(() => router.replace(login.pathname + login.search), 2200);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[#0a0f1c] px-4 text-center text-slate-300">
      <p className="rounded-2xl border border-slate-800 bg-[#111827] px-6 py-4 text-sm">
        {message}
      </p>
      <Link href="/login" className="text-xs text-slate-500 underline">
        Back to sign in
      </Link>
    </div>
  );
}
