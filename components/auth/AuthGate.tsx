"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { safeNextPath } from "@/lib/safe-next-path";
import { hideNativeSplash } from "@/lib/native-splash";

/**
 * Requires a signed-in user for the main app (token billing + store accounts).
 * Never blocks forever if session bootstrap hangs (iPad / WKWebView).
 */
export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [bootTimedOut, setBootTimedOut] = useState(false);

  useEffect(() => {
    void hideNativeSplash();
  }, []);

  useEffect(() => {
    if (!loading) {
      setBootTimedOut(false);
      return;
    }
    const id = window.setTimeout(() => setBootTimedOut(true), 10_000);
    return () => window.clearTimeout(id);
  }, [loading]);

  useEffect(() => {
    if (loading && !bootTimedOut) return;
    if (!isAuthenticated) {
      const next = encodeURIComponent(safeNextPath(pathname || "/app"));
      router.replace(`/login?next=${next}`);
    }
  }, [isAuthenticated, loading, bootTimedOut, pathname, router]);

  if (loading && !bootTimedOut) {
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
