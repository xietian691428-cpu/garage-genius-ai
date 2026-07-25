"use client";

import Link from "next/link";
import { useTokenUsage } from "@/hooks/useTokenUsage";

const PLAN_LABEL: Record<string, string> = {
  free: "Free",
  pro: "Pro",
  pro_heavy: "Pro Heavy",
};

export default function TokenDisplay() {
  const { usage, loading, isNearLimit, isExhausted } = useTokenUsage();

  const planLabel = PLAN_LABEL[usage.plan] ?? usage.plan;
  const barColor = isExhausted
    ? "bg-red-400"
    : isNearLimit
      ? "bg-amber-400"
      : "bg-cyan-400";

  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-900 p-4 text-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-slate-400">Monthly Tokens</span>
        <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-cyan-300">
          {planLabel}
        </span>
      </div>

      <div className="mb-2 flex justify-between gap-2 font-medium text-slate-200">
        <span>
          {loading
            ? "…"
            : `${usage.used.toLocaleString()} / ${usage.limit.toLocaleString()}`}
        </span>
        {usage.bonusRemaining > 0 && (
          <span className="text-xs font-normal text-emerald-400">
            +{usage.bonusRemaining.toLocaleString()} top-up
          </span>
        )}
      </div>

      <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
        <div
          className={`h-full transition-all ${barColor}`}
          style={{ width: `${loading ? 0 : usage.percentage}%` }}
        />
      </div>

      {isExhausted ? (
        <p className="mt-2 text-xs text-red-300">
          Monthly quota used up.{" "}
          <Link href="/recharge" className="underline hover:text-red-200">
            Buy more tokens
          </Link>
        </p>
      ) : isNearLimit ? (
        <p className="mt-2 text-xs text-amber-400">
          Running low —{" "}
          <Link href="/recharge" className="underline hover:text-amber-300">
            top up
          </Link>{" "}
          or upgrade.
        </p>
      ) : !usage.signedIn ? (
        <p className="mt-2 text-xs text-slate-500">
          Sign in to track usage across devices. Free plan includes{" "}
          {usage.limit.toLocaleString()} tokens / month.
        </p>
      ) : (
        <p className="mt-2 text-xs text-slate-500">
          <Link href="/recharge" className="text-cyan-400 hover:underline">
            Buy more tokens
          </Link>
        </p>
      )}
    </div>
  );
}
