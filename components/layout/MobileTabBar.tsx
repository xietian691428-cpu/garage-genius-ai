"use client";

import {
  BookOpen,
  Car,
  History,
  Home,
  MessageSquare,
  Settings,
  ShoppingCart,
} from "lucide-react";
import Link from "next/link";
import { useTokenUsage } from "@/hooks/useTokenUsage";

const TABS = [
  { id: "dashboard", label: "Home", icon: Home },
  { id: "chat", label: "AI", icon: MessageSquare },
  { id: "coach", label: "Guides", icon: BookOpen },
  { id: "history", label: "History", icon: History },
  { id: "parts", label: "Parts", icon: ShoppingCart },
  { id: "settings", label: "Account", icon: Settings },
] as const;

interface Props {
  activeTab: string;
  onTabChange: (tab: string) => void;
  /**
   * `top` — mobile Safari / Chrome web (US-EU habit: browser owns the bottom).
   * `bottom` — Capacitor native shell (iOS/Android HIG bottom tabs).
   */
  placement?: "top" | "bottom";
}

function TokenStrip() {
  const { usage, isExhausted, isNearLimit } = useTokenUsage();
  const barWidth = usage.unlimited
    ? 100
    : Math.min(100, Math.max(0, usage.percentLeft));
  const barColor = isExhausted
    ? "bg-red-400"
    : isNearLimit
      ? "bg-amber-400"
      : "bg-cyan-400";

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <Car className="h-3.5 w-3.5 shrink-0 text-cyan-400" aria-hidden />
      <div className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-800">
        <div
          className={`h-full transition-all ${barColor}`}
          style={{ width: `${barWidth}%` }}
        />
      </div>
      <Link
        href="/recharge"
        className="shrink-0 text-[10px] font-medium text-cyan-400"
      >
        {isExhausted ? "Recharge" : usage.unlimited ? "Unlimited" : `${Math.round(usage.percentLeft)}% left`}
      </Link>
    </div>
  );
}

/**
 * Phone / tablet portrait nav — matches desktop Sidebar destinations.
 * Hidden from lg up (desktop sidebar takes over).
 */
export default function MobileTabBar({
  activeTab,
  onTabChange,
  placement = "top",
}: Props) {
  if (placement === "top") {
    return (
      <div className="shrink-0 border-b border-slate-800 bg-[#0a0f1c] lg:hidden">
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-cyan-500">
            <span className="text-sm font-bold text-black">G</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">
              Garage Genius
            </p>
            <div className="mt-1">
              <TokenStrip />
            </div>
          </div>
        </div>

        <nav
          className="flex gap-1 overflow-x-auto px-2 pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          aria-label="Main"
        >
          {TABS.map(({ id, label, icon: Icon }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onTabChange(id)}
                className={`flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-xs font-semibold transition-colors ${
                  active
                    ? "bg-cyan-500/15 text-cyan-300 ring-1 ring-cyan-400/40"
                    : "text-slate-400 active:bg-slate-900/80"
                }`}
              >
                <Icon
                  className={`h-4 w-4 ${active ? "text-cyan-400" : ""}`}
                  strokeWidth={active ? 2.25 : 1.75}
                />
                {label}
              </button>
            );
          })}
        </nav>
      </div>
    );
  }

  return (
    <div className="mobile-bottom-chrome shrink-0 border-t border-slate-800 bg-[#0a0f1c] lg:hidden">
      <div className="flex items-center gap-2 border-b border-slate-800/80 px-3 py-1.5">
        <TokenStrip />
      </div>

      <nav
        className="flex items-stretch justify-around px-1 pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-1"
        aria-label="Main"
      >
        {TABS.map(({ id, label, icon: Icon }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onTabChange(id)}
              className={`flex min-h-[52px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 transition-colors ${
                active
                  ? "text-cyan-300"
                  : "text-slate-500 active:bg-slate-900/80"
              }`}
            >
              <Icon
                className={`h-5 w-5 ${active ? "text-cyan-400" : ""}`}
                strokeWidth={active ? 2.25 : 1.75}
              />
              <span className="truncate text-[10px] font-medium leading-none">
                {label}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
