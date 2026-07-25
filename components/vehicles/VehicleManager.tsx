"use client";

import { useState } from "react";
import { VehicleInfo } from "@/lib/types/chat";
import VehiclePanel from "@/components/chat/VehiclePanel";
import VehicleList from "./VehicleList";
import AddVehicleModal from "./AddVehicleModal";

interface Props {
  vehicles: VehicleInfo[];
  currentVehicle: VehicleInfo | null;
  onVehicleChange: (vehicle: VehicleInfo) => void;
  onAddVehicle: (vehicle: VehicleInfo) => void;
  onUpdateVehicle?: (vehicle: VehicleInfo) => void | Promise<void>;
  onArchiveVehicle?: (vehicle: VehicleInfo) => void | Promise<void>;
  onRemoveVehicle?: (vehicle: VehicleInfo) => void | Promise<void>;
}

export default function VehicleManager({
  vehicles,
  currentVehicle,
  onVehicleChange,
  onAddVehicle,
  onUpdateVehicle,
  onArchiveVehicle,
  onRemoveVehicle,
}: Props) {
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<VehicleInfo | null>(null);

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
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Vehicle profiles</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Active garage · injected into Coach Guides automatically
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm hover:bg-blue-500"
          >
            + Add Vehicle
          </button>
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
        open={showAdd}
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
