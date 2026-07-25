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
import TokenDisplay from "@/components/ui/token-display";

const menuItems = [
  { id: "dashboard", label: "Dashboard", icon: Home },
  { id: "chat", label: "AI Assistant", icon: MessageSquare },
  { id: "coach", label: "Coach Guides", icon: BookOpen },
  { id: "history", label: "Maintenance History", icon: History },
  { id: "parts", label: "Parts Inventory", icon: ShoppingCart },
  { id: "settings", label: "Account", icon: Settings },
];

interface Props {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export default function Sidebar({ activeTab, onTabChange }: Props) {
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
            <button
              key={item.id}
              type="button"
              onClick={() => onTabChange(item.id)}
              className={`flex w-full items-center gap-3.5 rounded-2xl px-5 py-3.5 text-left transition-all ${
                isActive
                  ? "bg-slate-800 text-white shadow-md"
                  : "text-slate-400 hover:bg-slate-900 hover:text-slate-200"
              }`}
            >
              <Icon className="h-5 w-5" />
              <span className="font-medium">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="space-y-3 border-t border-slate-800 p-4">
        <TokenDisplay />
        <p className="px-1 text-[11px] text-slate-500">
          Quotas: Free 15k · Pro 150k · Heavy 400k / month.
        </p>
      </div>
    </div>
  );
}
