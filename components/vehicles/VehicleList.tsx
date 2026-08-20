"use client";

import { useMemo, useState } from "react";
import { Archive, Pencil, Trash2 } from "lucide-react";
import { VehicleInfo } from "@/lib/types/chat";
import {
  formatVehicleYmmDisplay,
  normalizeVehicleMarket,
  VEHICLE_MARKETS,
  type VehicleMarketCode,
} from "@/lib/types/vehicle-market";

type MarketFilter = "ALL" | VehicleMarketCode;

interface Props {
  vehicles: VehicleInfo[];
  currentVehicle: VehicleInfo | null;
  onSelect: (vehicle: VehicleInfo) => void;
  onEdit?: (vehicle: VehicleInfo) => void;
  onArchive?: (vehicle: VehicleInfo) => void;
  onRemove?: (vehicle: VehicleInfo) => void;
  /** When true, hide the built-in market filter (parent provides one) */
  hideMarketFilter?: boolean;
  /** Controlled filter from parent */
  marketFilter?: MarketFilter;
}

/** 可复用的车辆列表，桌面侧栏与移动端抽屉共用 */
export default function VehicleList({
  vehicles,
  currentVehicle,
  onSelect,
  onEdit,
  onArchive,
  onRemove,
  hideMarketFilter,
  marketFilter: controlledFilter,
}: Props) {
  const [localFilter, setLocalFilter] = useState<MarketFilter>("ALL");
  const marketFilter = controlledFilter ?? localFilter;

  const marketsInGarage = useMemo(() => {
    const codes = new Set(
      vehicles.map((v) => normalizeVehicleMarket(v.market)),
    );
    return VEHICLE_MARKETS.filter((m) => codes.has(m.code));
  }, [vehicles]);

  const filtered = useMemo(() => {
    if (marketFilter === "ALL") return vehicles;
    return vehicles.filter(
      (v) => normalizeVehicleMarket(v.market) === marketFilter,
    );
  }, [vehicles, marketFilter]);

  if (vehicles.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-slate-700 px-4 py-8 text-center text-sm text-slate-500">
        No vehicles in your garage yet.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {!hideMarketFilter && marketsInGarage.length > 1 && (
        <label className="block text-xs text-slate-500">
          Filter by market
          <select
            value={marketFilter}
            onChange={(e) => setLocalFilter(e.target.value as MarketFilter)}
            className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-slate-200 focus:border-cyan-400 focus:outline-none"
          >
            <option value="ALL">All markets</option>
            {marketsInGarage.map((m) => (
              <option key={m.code} value={m.code}>
                {m.code} · {m.label}
              </option>
            ))}
          </select>
        </label>
      )}

      {filtered.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-700 px-4 py-6 text-center text-sm text-slate-500">
          No vehicles in this market.
        </p>
      ) : (
        filtered.map((vehicle) => (
          <div
            key={vehicle.id}
            className={`rounded-2xl border transition-all ${
              vehicle.id === currentVehicle?.id
                ? "border-blue-500 bg-blue-950/30"
                : "border-slate-700"
            }`}
          >
            <button
              type="button"
              onClick={() => onSelect(vehicle)}
              className="w-full p-4 text-left hover:bg-slate-800/30 active:bg-slate-800/50"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="font-medium">{vehicle.name}</div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <span className="rounded bg-cyan-500/15 px-1.5 py-0.5 text-[10px] font-medium text-cyan-300">
                    {normalizeVehicleMarket(vehicle.market)}
                  </span>
                  {vehicle.vcdb?.source === "vcdb" && (
                    <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-300">
                      VCdb
                    </span>
                  )}
                </div>
              </div>
              <div className="text-sm text-slate-400">
                {formatVehicleYmmDisplay(vehicle)}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {vehicle.mileage.toLocaleString()} mi · {vehicle.engine}
                {vehicle.driveType ? ` · ${vehicle.driveType}` : ""}
              </div>
            </button>
            {(onEdit || onArchive || onRemove) && (
              <div className="flex flex-wrap gap-1 border-t border-slate-800/80 px-3 py-2">
                {onEdit && (
                  <button
                    type="button"
                    onClick={() => onEdit(vehicle)}
                    className="inline-flex min-h-[44px] touch-manipulation items-center gap-1.5 rounded-lg px-2.5 text-xs text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit profile
                  </button>
                )}
                {onArchive && (
                  <button
                    type="button"
                    onClick={() => {
                      if (
                        confirm(
                          `Archive “${vehicle.name}”? It leaves the active garage but keeps history.`,
                        )
                      ) {
                        onArchive(vehicle);
                      }
                    }}
                    className="inline-flex min-h-[44px] touch-manipulation items-center gap-1.5 rounded-lg px-2.5 text-xs text-slate-400 hover:bg-slate-800 hover:text-amber-200"
                  >
                    <Archive className="h-3.5 w-3.5" />
                    Archive
                  </button>
                )}
                {onRemove && (
                  <button
                    type="button"
                    onClick={() => {
                      if (
                        confirm(
                          `Permanently delete “${vehicle.name}”? This cannot be undone.`,
                        )
                      ) {
                        onRemove(vehicle);
                      }
                    }}
                    className="inline-flex min-h-[44px] touch-manipulation items-center gap-1.5 rounded-lg px-2.5 text-xs text-slate-400 hover:bg-red-950/40 hover:text-red-300"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </button>
                )}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
