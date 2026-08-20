"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { VehicleInfo } from "@/lib/types/chat";
import { useBodyScrollLock } from "@/lib/hooks/useBodyScrollLock";
import VehicleList from "./VehicleList";
import AddVehicleModal from "./AddVehicleModal";
import { hideStorePurchaseUi } from "@/lib/native-platform";

interface Props {
  open: boolean;
  onClose: () => void;
  vehicles: VehicleInfo[];
  currentVehicle: VehicleInfo | null;
  onVehicleChange: (vehicle: VehicleInfo) => void;
  onAddVehicle: (vehicle: VehicleInfo) => void;
  onUpdateVehicle?: (vehicle: VehicleInfo) => void | Promise<void>;
  /** Mirror Dashboard / subscription gate. */
  canAdd?: boolean;
  maxVehicles?: number;
}

/**
 * 手机 / iPad 底部抽屉。xl 以下显示（含 iPad Air 11 横屏）。
 */
export default function MobileVehicleSwitcher({
  open,
  onClose,
  vehicles,
  currentVehicle,
  onVehicleChange,
  onAddVehicle,
  onUpdateVehicle,
  canAdd = true,
  maxVehicles,
}: Props) {
  const { t } = useTranslation();
  const [showAddForm, setShowAddForm] = useState(false);
  const [editing, setEditing] = useState<VehicleInfo | null>(null);

  useBodyScrollLock(open);

  if (!open) return null;

  const handleSelect = (vehicle: VehicleInfo) => {
    if (vehicle.id !== currentVehicle?.id) {
      onVehicleChange(vehicle);
    }
    onClose();
  };

  const handleAdd = (vehicle: VehicleInfo) => {
    onAddVehicle(vehicle);
    setShowAddForm(false);
    onClose();
  };

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
    <>
      <div
        className="fixed inset-0 z-50 xl:hidden"
        role="dialog"
        aria-modal="true"
        aria-label="Switch vehicle"
      >
        <button
          type="button"
          aria-label="Close vehicle switcher"
          className="absolute inset-0 bg-black/70"
          onClick={onClose}
        />

        <div className="absolute inset-x-0 bottom-0 mx-auto flex max-h-[80dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border-t border-slate-700 bg-[#111827] shadow-2xl sm:max-w-xl md:max-w-2xl">
          <div className="flex justify-center pt-3 pb-1">
            <div className="h-1 w-10 rounded-full bg-slate-600" />
          </div>

          <div className="flex items-center justify-between px-5 pb-4">
            <h2 className="text-lg font-semibold">Switch Vehicle</h2>
            <button
              type="button"
              onClick={onClose}
              className="flex h-11 w-11 items-center justify-center rounded-full text-slate-400 hover:bg-slate-800 hover:text-white"
              aria-label="Close"
            >
              <X size={20} />
            </button>
          </div>

          <div className="chat-scroll min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-5 pb-4">
            <VehicleList
              vehicles={vehicles}
              currentVehicle={currentVehicle}
              onSelect={handleSelect}
              onEdit={
                onUpdateVehicle
                  ? (v) => {
                      setEditing(v);
                    }
                  : undefined
              }
            />
          </div>

          <div className="shrink-0 border-t border-slate-800 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {canAdd ? (
              <button
                type="button"
                data-testid="add-vehicle-open"
                onClick={() => setShowAddForm(true)}
                className="min-h-[48px] w-full rounded-2xl bg-blue-600 py-3.5 text-sm font-medium transition-colors hover:bg-blue-500 active:scale-[0.98]"
              >
                + Add Vehicle
              </button>
            ) : (
              <p
                data-testid="add-vehicle-limit"
                className="rounded-2xl border border-slate-700 bg-slate-900/60 px-3 py-3 text-center text-xs leading-relaxed text-slate-400"
              >
                {limitLabel}
              </p>
            )}
          </div>
        </div>
      </div>

      <AddVehicleModal
        open={showAddForm && canAdd}
        onClose={() => setShowAddForm(false)}
        onAdd={handleAdd}
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
    </>
  );
}
