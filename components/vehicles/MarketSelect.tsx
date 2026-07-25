"use client";

import {
  VEHICLE_MARKETS,
  type VehicleMarketCode,
} from "@/lib/types/vehicle-market";

type Props = {
  value: VehicleMarketCode;
  onChange: (next: VehicleMarketCode) => void;
  disabled?: boolean;
  /** compact = select only; default shows hint under control */
  compact?: boolean;
  id?: string;
  label?: string;
};

export default function MarketSelect({
  value,
  onChange,
  disabled,
  compact,
  id = "vehicle-market",
  label = "Market / country version",
}: Props) {
  const current = VEHICLE_MARKETS.find((m) => m.code === value);

  return (
    <label className="block text-sm text-slate-400" htmlFor={id}>
      {label}
      <select
        id={id}
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value as VehicleMarketCode)}
        className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-base text-slate-200 focus:border-cyan-400 focus:outline-none disabled:opacity-50"
      >
        {VEHICLE_MARKETS.map((m) => (
          <option key={m.code} value={m.code}>
            {m.label}
          </option>
        ))}
      </select>
      {!compact && current && (
        <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
          {current.hint}. Manuals and some specs differ by market — pick where
          this car was sold / registered.
        </p>
      )}
    </label>
  );
}
