"use client";

import type { VehicleInfo } from "@/lib/types/chat";
import { formatVehiclePickerLabel } from "@/lib/types/vehicle-market";

type Props = {
  vehicles: VehicleInfo[];
  current: VehicleInfo | null;
  loading?: boolean;
  onVehicleChange: (v: VehicleInfo) => void;
};

export default function HomeTopBar({
  vehicles,
  current,
  loading,
  onVehicleChange,
}: Props) {
  return (
    <header data-testid="home-top-bar">
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
                {formatVehiclePickerLabel(v)}
              </option>
            ))
          )}
        </select>
      </label>
    </header>
  );
}
