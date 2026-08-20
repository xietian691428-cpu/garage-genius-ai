"use client";

import { VehicleInfo } from "@/lib/types/chat";
import { Car, Gauge, Calendar, Pencil } from "lucide-react";
import VehicleConfigCard from "@/components/vehicles/VehicleConfigCard";
import { formatVehiclePickerLabel, formatVehicleYmmDisplay } from "@/lib/types/vehicle-market";
import { formatAppDateOnly, formatAppNumber } from "@/lib/format-app-date";

interface Props {
  vehicle: VehicleInfo | null;
  isMobile?: boolean;
  onEdit?: () => void;
}

export default function VehiclePanel({ vehicle, isMobile, onEdit }: Props) {
  if (!vehicle) {
    return (
      <div className={`${isMobile ? "flex items-center gap-4" : "p-6"}`}>
        <div
          className={`flex items-center justify-center rounded-2xl bg-slate-800 ${
            isMobile ? "h-12 w-12" : "h-16 w-16"
          }`}
        >
          <Car
            className={
              isMobile ? "h-6 w-6 text-slate-500" : "h-9 w-9 text-slate-500"
            }
          />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-500">No vehicle yet</p>
          <h2
            className={`font-bold text-slate-300 ${isMobile ? "text-base" : "text-xl"}`}
          >
            Add a car to get started
          </h2>
        </div>
      </div>
    );
  }

  const trimLine = [vehicle.submodel, vehicle.driveType, vehicle.engine]
    .filter(Boolean)
    .join(" · ");

  if (isMobile) {
    const shortLabel = formatVehiclePickerLabel(vehicle);
    return (
      <div className="flex min-h-[44px] items-center gap-2.5 py-0.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-cyan-400">
          <Car className="h-4 w-4 text-white" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{shortLabel}</p>
          <p className="truncate text-[11px] text-slate-500">
            Tap to switch vehicle
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 p-4">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-400">
        <Car className="h-6 w-6 text-white" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-cyan-400">{vehicle.name}</p>
            <h2 className="text-lg font-bold leading-snug text-white">
              {formatVehicleYmmDisplay(vehicle)}
            </h2>
          </div>
          {onEdit ? (
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-cyan-500/50 hover:text-white"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </button>
          ) : null}
        </div>

        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <Gauge className="h-4 w-4" />
              {formatAppNumber(vehicle.mileage)} mi
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="h-4 w-4" />
              Last service:{" "}
              {vehicle.lastMaintenance
                ? formatAppDateOnly(vehicle.lastMaintenance)
                : "—"}
            </span>
          </div>
          {trimLine ? (
            <p className="text-xs text-slate-500">{trimLine}</p>
          ) : null}
          <VehicleConfigCard vehicle={vehicle} compact />
        </div>
      </div>
    </div>
  );
}
