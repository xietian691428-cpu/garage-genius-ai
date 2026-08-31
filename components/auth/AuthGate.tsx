"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { safeNextPath } from "@/lib/safe-next-path";
import { hideNativeSplash } from "@/lib/native-splash";

/**
 * Requires a signed-in user for the main app (token billing + store accounts).
 * Never redirects while session bootstrap is still in progress — a premature
 * redirect after Sign in with Apple caused App Review to land back on login.
 * Session load itself is bounded by AUTH_SESSION_TIMEOUT_MS in useAuth.
 */
export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    void hideNativeSplash();
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated) {
      const next = encodeURIComponent(safeNextPath(pathname || "/app"));
      router.replace(`/login?next=${next}`);
    }
  }, [isAuthenticated, loading, pathname, router]);

  if (loading) {
    return (
      <div
        data-testid="auth-gate-loading"
        className="flex h-dvh items-center justify-center bg-[#0a0f1c] text-slate-400"
        role="status"
      >
        Loading your garage…
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div
        data-testid="auth-gate-redirect"
        className="flex h-dvh items-center justify-center bg-[#0a0f1c] text-slate-400"
      >
        Redirecting to sign in…
      </div>
    );
  }

  return <>{children}</>;
}
