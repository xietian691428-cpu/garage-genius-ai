"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";
import { isQaUnlockEnabled } from "@/lib/qa-mode";
import { hideStorePurchaseUi } from "@/lib/native-platform";

type UpgradeButtonProps = {
  /** Compact for headers; default is medium */
  size?: "sm" | "md";
  className?: string;
  label?: string;
};

/** Navigates to /pricing — Stripe checkout happens there after plan pick. Hidden in store shells. */
export default function UpgradeButton({
  size = "md",
  className = "",
  label = "Upgrade",
}: UpgradeButtonProps) {
  if (isQaUnlockEnabled()) return null;
  if (hideStorePurchaseUi()) return null;

  const sizeClass =
    size === "sm"
      ? "min-h-[44px] px-3 py-2 text-xs"
      : "min-h-[44px] px-4 py-2.5 text-sm";

  return (
    <Link
      href="/pricing"
      className={`inline-flex touch-manipulation items-center gap-1.5 rounded-xl bg-cyan-500 font-semibold text-black transition hover:bg-cyan-400 ${sizeClass} ${className}`}
    >
      <Sparkles className="h-3.5 w-3.5" aria-hidden />
      {label}
    </Link>
  );
}
