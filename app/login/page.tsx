"use client";

import { Suspense, useEffect } from "react";
import AuthForm from "@/components/auth/AuthForm";
import { hideNativeSplash } from "@/lib/native-splash";

/**
 * Login must remain scrollable on iPad (esp. landscape + keyboard) so the
 * Sign in button stays reachable — App Store 2.1 completeness.
 */
export default function LoginPage() {
  useEffect(() => {
    void hideNativeSplash();
  }, []);

  return (
    <div
      data-testid="login-page"
      className="login-page flex min-h-dvh items-start justify-center overflow-y-auto overscroll-y-contain bg-[#0a0f1c] px-4 py-8 sm:items-center sm:py-10"
      style={{
        paddingTop: "max(2rem, env(safe-area-inset-top))",
        paddingBottom: "max(2rem, env(safe-area-inset-bottom))",
        paddingLeft: "max(1rem, env(safe-area-inset-left))",
        paddingRight: "max(1rem, env(safe-area-inset-right))",
        WebkitOverflowScrolling: "touch",
      }}
    >
      <Suspense
        fallback={
          <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-[#111827] p-8 text-center text-slate-400">
            Loading…
          </div>
        }
      >
        <AuthForm />
      </Suspense>
    </div>
  );
}
