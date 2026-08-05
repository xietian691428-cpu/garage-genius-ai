"use client";

import { Settings } from "lucide-react";
import type { VehicleInfo } from "@/lib/types/chat";
import { formatVehicleYmmMarket } from "@/lib/types/vehicle-market";

type Props = {
  vehicles: VehicleInfo[];
  current: VehicleInfo | null;
  loading?: boolean;
  onVehicleChange: (v: VehicleInfo) => void;
  onOpenSettings: () => void;
};

export default function HomeTopBar({
  vehicles,
  current,
  loading,
  onVehicleChange,
  onOpenSettings,
}: Props) {
  return (
    <header
      data-testid="home-top-bar"
      className="flex items-start justify-between gap-3"
    >
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Home
        </p>
        <label className="mt-1 block">
          <span className="sr-only">Current vehicle</span>
          <select
            data-testid="home-vehicle-select"
            disabled={loading || vehicles.length === 0}
            className="mt-0.5 w-full max-w-md truncate rounded-2xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm font-medium text-white outline-none focus:border-cyan-400"
            value={current?.id ?? ""}
            onChange={(e) => {
              const next = vehicles.find((v) => v.id === e.target.value);
              if (next) onVehicleChange(next);
            }}
          >
            {vehicles.length === 0 ? (
              <option value="">No vehicle yet</option>
            ) : (
              vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {formatVehicleYmmMarket(v)}
                </option>
              ))
            )}
          </select>
        </label>
      </div>
      <button
        type="button"
        data-testid="home-settings"
        onClick={onOpenSettings}
        className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-2xl border border-slate-700 text-slate-300 hover:border-cyan-500/40 hover:text-cyan-200"
        aria-label="Settings"
      >
        <Settings className="h-5 w-5" />
      </button>
    </header>
  );
}
