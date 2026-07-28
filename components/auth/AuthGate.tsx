"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { safeNextPath } from "@/lib/safe-next-path";

/**
 * Requires a signed-in user for the main app (token billing + store accounts).
 */
export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated) {
      const next = encodeURIComponent(safeNextPath(pathname || "/app"));
      router.replace(`/login?next=${next}`);
    }
  }, [isAuthenticated, loading, pathname, router]);

  if (loading) {
    return (
      <div className="flex h-dvh items-center justify-center bg-[#0a0f1c] text-slate-400">
        Loading your garage…
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex h-dvh items-center justify-center bg-[#0a0f1c] text-slate-400">
        Redirecting to sign in…
      </div>
    );
  }

  return <>{children}</>;
}
