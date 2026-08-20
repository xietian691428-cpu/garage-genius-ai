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
import { useSearchParams } from "next/navigation";
import { useTokenUsage } from "@/hooks/useTokenUsage";
import { hideWebCheckoutUi } from "@/lib/native-platform";
import { appTabHref, type AppTab } from "@/lib/app-tab";

const TABS: { id: AppTab; label: string; icon: typeof Home }[] = [
  { id: "dashboard", label: "Home", icon: Home },
  { id: "chat", label: "Chat", icon: MessageSquare },
  { id: "coach", label: "Guides", icon: BookOpen },
  { id: "history", label: "History", icon: History },
  { id: "parts", label: "Parts", icon: ShoppingCart },
];

interface Props {
  activeTab: string;
  /**
   * `top` — mobile Safari / Chrome web (US-EU habit: browser owns the bottom).
   * `bottom` — Capacitor native shell (iOS/Android HIG bottom tabs).
   */
  placement?: "top" | "bottom";
}

function TokenStrip() {
  const { usage, isExhausted, isNearLimit } = useTokenUsage();
  const storeSafe = hideWebCheckoutUi();
  const barWidth = usage.unlimited
    ? 100
    : Math.min(100, Math.max(0, usage.percentLeft));
  const barColor = isExhausted
    ? "bg-red-400"
    : isNearLimit
      ? "bg-amber-400"
      : "bg-cyan-400";
  const label = isExhausted
    ? storeSafe
      ? "Quota used"
      : "Recharge"
    : usage.unlimited
      ? "Unlimited"
      : `${Math.round(usage.percentLeft)}% left`;

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <Car className="h-3.5 w-3.5 shrink-0 text-cyan-400" aria-hidden />
      <div className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-800">
        <div
          className={`h-full transition-all ${barColor}`}
          style={{ width: `${barWidth}%` }}
        />
      </div>
      {storeSafe ? (
        isExhausted ? (
          <Link
            href="/pricing"
            className="shrink-0 text-[10px] font-medium text-cyan-400"
          >
            {label}
          </Link>
        ) : (
          <span className="shrink-0 text-[10px] font-medium text-slate-400">
            {label}
          </span>
        )
      ) : (
        <Link
          href="/recharge"
          className="shrink-0 text-[10px] font-medium text-cyan-400"
        >
          {label}
        </Link>
      )}
    </div>
  );
}

/**
 * Phone / tablet portrait nav — matches desktop Sidebar destinations.
 * Hidden from xl up (desktop sidebar takes over). iPad Air 11 landscape
 * stays on these tabs — see lib/app-chrome.ts.
 * Tab clicks are Links so URL `?tab=` is the only source of truth.
 * Account lives on the header gear (5 main tabs — iOS HIG).
 */
export default function MobileTabBar({
  activeTab,
  placement = "top",
}: Props) {
  const searchParams = useSearchParams();
  const accountActive = activeTab === "settings";

  const accountLink = (
    <Link
      href={appTabHref("settings", searchParams)}
      replace
      scroll={false}
      data-testid="app-tab-settings"
      aria-label="Account"
      aria-current={accountActive ? "page" : undefined}
      className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors ${
        accountActive
          ? "bg-cyan-500/15 text-cyan-300"
          : "text-slate-400 active:bg-slate-900/80"
      }`}
    >
      <Settings className="h-5 w-5" strokeWidth={accountActive ? 2.25 : 1.75} />
    </Link>
  );

  const tabLink = (id: AppTab, label: string, Icon: typeof Home) => {
    const active = activeTab === id;
    return (
      <Link
        key={id}
        href={appTabHref(id, searchParams)}
        replace
        scroll={false}
        data-testid={`app-tab-${id}`}
        aria-label={label}
        aria-current={active ? "page" : undefined}
        className={`flex min-h-[48px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-0.5 transition-colors ${
          active
            ? "bg-cyan-500/15 text-cyan-300"
            : "text-slate-500 active:bg-slate-900/80"
        }`}
      >
        <Icon
          className={`h-5 w-5 ${active ? "text-cyan-400" : ""}`}
          strokeWidth={active ? 2.25 : 1.75}
        />
        <span className="max-w-full truncate text-[10px] font-medium leading-none">
          {label}
        </span>
      </Link>
    );
  };

  if (placement === "top") {
    return (
      <div className="shrink-0 border-b border-slate-800 bg-[#0a0f1c] xl:hidden">
        <div className="flex items-center gap-2 px-3 py-2">
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
          {accountLink}
        </div>

        <nav
          className="flex items-stretch justify-around px-1 pb-1.5"
          aria-label="Main"
        >
          {TABS.map(({ id, label, icon }) => tabLink(id, label, icon))}
        </nav>
      </div>
    );
  }

  return (
    <div className="mobile-bottom-chrome shrink-0 border-t border-slate-800 bg-[#0a0f1c] xl:hidden">
      <div className="flex items-center gap-2 border-b border-slate-800/80 px-3 py-1.5">
        <TokenStrip />
        {accountLink}
      </div>

      <nav
        className="flex items-stretch justify-around px-1 pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-1"
        aria-label="Main"
      >
        {TABS.map(({ id, label, icon }) => tabLink(id, label, icon))}
      </nav>
    </div>
  );
}
