"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Deep link → main app History tab */
export default function HistoryDeepLinkPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/app?tab=history");
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0f1c] text-slate-400">
      Opening maintenance history…
    </div>
  );
}
