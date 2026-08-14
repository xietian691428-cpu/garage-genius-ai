"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { VehicleInfo } from "@/lib/types/chat";
import VehiclePanel from "@/components/chat/VehiclePanel";
import VehicleList from "./VehicleList";
import AddVehicleModal from "./AddVehicleModal";
import { hideStorePurchaseUi } from "@/lib/native-platform";

interface Props {
  vehicles: VehicleInfo[];
  currentVehicle: VehicleInfo | null;
  onVehicleChange: (vehicle: VehicleInfo) => void;
  onAddVehicle: (vehicle: VehicleInfo) => void;
  onUpdateVehicle?: (vehicle: VehicleInfo) => void | Promise<void>;
  onArchiveVehicle?: (vehicle: VehicleInfo) => void | Promise<void>;
  onRemoveVehicle?: (vehicle: VehicleInfo) => void | Promise<void>;
  /** Mirror Dashboard / subscription gate — hide open when at plan limit. */
  canAdd?: boolean;
  maxVehicles?: number;
}

export default function VehicleManager({
  vehicles,
  currentVehicle,
  onVehicleChange,
  onAddVehicle,
  onUpdateVehicle,
  onArchiveVehicle,
  onRemoveVehicle,
  canAdd = true,
  maxVehicles,
}: Props) {
  const { t } = useTranslation();
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<VehicleInfo | null>(null);

  const limitLabel =
    typeof maxVehicles === "number"
      ? t(
          hideStorePurchaseUi()
            ? "vehicles.planLimitStore"
            : "vehicles.planLimit",
          { count: maxVehicles },
        )
      : t(
          hideStorePurchaseUi()
            ? "vehicles.limitReachedStore"
            : "vehicles.limitReached",
        );

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="shrink-0 border-b border-slate-800 bg-[#111827]">
        <VehiclePanel
          vehicle={currentVehicle}
          onEdit={
            onUpdateVehicle && currentVehicle
              ? () => setEditing(currentVehicle)
              : undefined
          }
        />
      </div>

      <div className="flex-1 p-4 sm:p-5 lg:p-6">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">Vehicle profiles</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Active garage · injected into Coach Guides automatically
            </p>
          </div>
          {canAdd ? (
            <button
              type="button"
              data-testid="add-vehicle-open"
              onClick={() => setShowAdd(true)}
              className="flex shrink-0 items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm hover:bg-blue-500"
            >
              + Add Vehicle
            </button>
          ) : (
            <p
              data-testid="add-vehicle-limit"
              className="max-w-[11rem] shrink-0 text-right text-[11px] leading-snug text-slate-500"
            >
              {limitLabel}
            </p>
          )}
        </div>

        <VehicleList
          vehicles={vehicles}
          currentVehicle={currentVehicle}
          onSelect={onVehicleChange}
          onEdit={onUpdateVehicle ? (v) => setEditing(v) : undefined}
          onArchive={
            onArchiveVehicle
              ? (v) => {
                  void onArchiveVehicle(v);
                }
              : undefined
          }
          onRemove={
            onRemoveVehicle
              ? (v) => {
                  void onRemoveVehicle(v);
                }
              : undefined
          }
        />
      </div>

      <AddVehicleModal
        open={showAdd && canAdd}
        onClose={() => setShowAdd(false)}
        onAdd={onAddVehicle}
      />

      <AddVehicleModal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        initialVehicle={editing}
        onSave={async (vehicle) => {
          if (onUpdateVehicle) await onUpdateVehicle(vehicle);
          setEditing(null);
        }}
      />
    </div>
  );
}
