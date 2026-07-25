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
}

/**
 * Phone / tablet portrait bottom nav — matches desktop Sidebar icons + slate/cyan.
 * Hidden from lg up (desktop sidebar takes over).
 */
export default function MobileTabBar({ activeTab, onTabChange }: Props) {
  const { usage, isExhausted, isNearLimit } = useTokenUsage();
  const pct = Math.min(100, Math.max(0, usage.percentage));
  const barColor = isExhausted
    ? "bg-red-400"
    : isNearLimit
      ? "bg-amber-400"
      : "bg-cyan-400";

  return (
    <div className="shrink-0 border-t border-slate-800 bg-[#0a0f1c] lg:hidden">
      <div className="flex items-center gap-2 border-b border-slate-800/80 px-3 py-1.5">
        <Car className="h-3.5 w-3.5 shrink-0 text-cyan-400" />
        <div className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-800">
          <div
            className={`h-full transition-all ${barColor}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <Link
          href="/recharge"
          className="shrink-0 text-[10px] font-medium text-cyan-400"
        >
          {isExhausted ? "Recharge" : `${Math.round(100 - pct)}% left`}
        </Link>
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
