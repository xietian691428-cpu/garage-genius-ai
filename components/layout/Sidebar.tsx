"use client";

import {
  Car,
  MessageSquare,
  History,
  ShoppingCart,
  Settings,
  Home,
  BookOpen,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import TokenDisplay from "@/components/ui/token-display";
import { appTabHref, type AppTab } from "@/lib/app-tab";

const menuItems: { id: AppTab; label: string; icon: typeof Home }[] = [
  { id: "dashboard", label: "Home", icon: Home },
  { id: "chat", label: "Chat", icon: MessageSquare },
  { id: "coach", label: "Guides", icon: BookOpen },
  { id: "history", label: "History", icon: History },
  { id: "parts", label: "Parts", icon: ShoppingCart },
  { id: "settings", label: "Account", icon: Settings },
];

interface Props {
  activeTab: string;
}

export default function Sidebar({ activeTab }: Props) {
  const searchParams = useSearchParams();

  return (
    <div className="flex h-full min-h-0 w-64 flex-col border-r border-slate-800 bg-[#0a0f1c] xl:w-72">
      <div className="flex items-center gap-3 border-b border-slate-800 p-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-cyan-500">
          <Car className="h-5 w-5 text-black" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Garage Genius</h1>
          <p className="-mt-1 text-xs text-cyan-400">AI Auto Assistant</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-4 py-6">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <Link
              key={item.id}
              href={appTabHref(item.id, searchParams)}
              replace
              scroll={false}
              data-testid={`app-sidebar-tab-${item.id}`}
              aria-current={isActive ? "page" : undefined}
              className={`flex w-full items-center gap-3.5 rounded-2xl px-5 py-3.5 text-left transition-all ${
                isActive
                  ? "bg-slate-800 text-white shadow-md"
                  : "text-slate-400 hover:bg-slate-900 hover:text-slate-200"
              }`}
            >
              <Icon className="h-5 w-5" />
              <span className="font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="space-y-3 border-t border-slate-800 p-4">
        <TokenDisplay />
        <p className="px-1 text-[11px] text-slate-500">
          Quotas: Free 15k tokens · 3 photos · Pro 150k · 30 photos · Heavy
          400k · 80 photos / month.
        </p>
      </div>
    </div>
  );
}
