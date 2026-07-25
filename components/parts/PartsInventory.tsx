"use client";

import { useCallback, useEffect, useState } from "react";
import {
  inventoryService,
  migrateFromLocalStorage,
} from "@/lib/supabase-inventory";
import type { InventoryItem as DbInventoryItem } from "@/lib/types/inventory";
import type { InventoryItem as FormInventoryItem } from "@/lib/types/parts";
import type { VehicleInfo } from "@/lib/types/chat";
import { formatVehicleYmmMarket } from "@/lib/types/vehicle-market";
import { AlertTriangle, Package, Plus } from "lucide-react";
import PartFormModal from "./PartFormModal";

type Props = {
  vehicles: VehicleInfo[];
  currentVehicle: VehicleInfo | null;
  vehiclesLoading?: boolean;
  onVehicleChange: (vehicle: VehicleInfo) => void | Promise<void>;
};

function formToDb(
  item: FormInventoryItem,
  vehicleId: string,
): Omit<DbInventoryItem, "id" | "last_updated"> {
  return {
    vehicle_id: vehicleId,
    oem_number: item.oemNumber?.trim() || undefined,
    brand: item.brand?.trim() || "Unknown",
    name: item.name.trim(),
    category: item.category,
    current_stock: Math.max(0, Number(item.currentStock) || 0),
    min_stock: Math.max(0, Number(item.minStock) || 0),
    price: Math.max(0, Number(item.price) || 0),
    location: item.location?.trim() || "Garage",
    purchase_links: item.purchaseLinks || [],
    notes: item.notes?.trim() || undefined,
  };
}

function dbToForm(
  item: DbInventoryItem,
  vehicleId: string,
): FormInventoryItem {
  return {
    id: item.id,
    vehicleId,
    name: item.name,
    oemNumber: item.oem_number || "",
    brand: item.brand || "",
    category: item.category,
    currentStock: item.current_stock,
    minStock: item.min_stock,
    price: Number(item.price) || 0,
    location: item.location || "",
    purchaseLinks: item.purchase_links || [],
    notes: item.notes || "",
    lastUpdated: new Date(item.last_updated),
    lastUsedInRepair: item.last_used_in_repair,
  };
}

export default function PartsInventory({
  vehicles,
  currentVehicle,
  vehiclesLoading = false,
  onVehicleChange,
}: Props) {
  const [items, setItems] = useState<DbInventoryItem[]>([]);
  const [filter, setFilter] = useState<"all" | "low-stock" | string>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<FormInventoryItem | null>(null);

  const vehicleId = currentVehicle?.id ?? null;

  const loadInventory = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      await migrateFromLocalStorage(id);
      const data = await inventoryService.getInventory(id);
      setItems(data);
    } catch (err) {
      console.error("[PartsInventory]", err);
      setError(
        err instanceof Error ? err.message : "Failed to load inventory",
      );
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (vehiclesLoading) return;
    if (!vehicleId) {
      setItems([]);
      setLoading(false);
      return;
    }
    void loadInventory(vehicleId);
  }, [vehicleId, vehiclesLoading, loadInventory]);

  const filteredItems = items.filter((item) => {
    if (filter === "low-stock") return item.current_stock <= item.min_stock;
    if (filter === "all") return true;
    return item.category === filter;
  });

  const lowStockCount = items.filter(
    (i) => i.current_stock <= i.min_stock,
  ).length;

  const handleSaveForm = async (formItem: FormInventoryItem) => {
    if (!vehicleId) throw new Error("No vehicle selected");
    await inventoryService.upsertItem(formToDb(formItem, vehicleId));
    setEditing(null);
    await loadInventory(vehicleId);
  };

  const vehicleLabel = currentVehicle
    ? formatVehicleYmmMarket(currentVehicle)
    : vehiclesLoading
      ? "Loading garage…"
      : "No vehicle selected";

  return (
    <div className="flex-1 overflow-auto p-4 sm:p-8">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold sm:text-4xl">Parts Inventory</h1>
          <p className="text-slate-400">
            {vehicleLabel} — track stock & wishlist for this car
          </p>
          {vehicles.length >= 1 && (
            <label className="mt-3 block max-w-md text-sm text-slate-400">
              Active vehicle
              <select
                className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-base text-slate-100 outline-none focus:border-cyan-400"
                value={currentVehicle?.id ?? ""}
                disabled={vehiclesLoading}
                onChange={(e) => {
                  const next = vehicles.find((v) => v.id === e.target.value);
                  if (next) void onVehicleChange(next);
                }}
              >
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} — {formatVehicleYmmMarket(v)}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <button
          type="button"
          disabled={!currentVehicle}
          onClick={() => {
            setEditing(null);
            setShowForm(true);
          }}
          className="inline-flex min-h-[48px] items-center justify-center gap-3 rounded-2xl bg-cyan-500 px-6 py-3 font-medium text-black disabled:opacity-40"
        >
          <Plus className="h-5 w-5" /> Add Part Manually
        </button>
      </div>

      {!vehiclesLoading && !currentVehicle && (
        <div className="mb-8 rounded-2xl border border-cyan-500/30 bg-cyan-500/5 p-5 text-sm text-slate-300">
          Add a vehicle from Dashboard or Chat first — inventory is stored per
          car in your cloud garage.
        </div>
      )}

      {error && (
        <p className="mb-4 text-sm text-rose-400">{error}</p>
      )}

      <div className="mb-8 flex flex-wrap gap-3">
        {["all", "low-stock", "brake", "engine", "filter", "consumable"].map(
          (f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-2xl px-5 py-2 capitalize transition-colors ${
                filter === f
                  ? "bg-cyan-500 text-black"
                  : "bg-slate-800 hover:bg-slate-700"
              }`}
            >
              {f === "low-stock" ? `Low Stock (${lowStockCount})` : f}
            </button>
          ),
        )}
      </div>

      {loading || vehiclesLoading ? (
        <div className="py-10 text-center text-slate-400">
          Loading inventory…
        </div>
      ) : !currentVehicle ? null : filteredItems.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-700 px-6 py-16 text-center text-slate-500">
          No parts for this vehicle yet. Save from Chat recommendations or add
          manually.
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                if (!currentVehicle) return;
                setEditing(dbToForm(item, currentVehicle.id));
                setShowForm(true);
              }}
              className="flex w-full items-center justify-between rounded-3xl border border-slate-700 bg-slate-900 p-6 text-left transition-colors hover:border-cyan-400/50"
            >
              <div className="flex items-center gap-6">
                <Package className="h-10 w-10 shrink-0 text-cyan-400" />
                <div>
                  <h3 className="text-lg font-semibold">{item.name}</h3>
                  <p className="text-sm text-slate-400">
                    {item.brand}
                    {item.oem_number ? ` • ${item.oem_number}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">{item.location}</p>
                </div>
              </div>

              <div className="text-right">
                <div className="text-2xl font-bold">
                  ${Number(item.price).toFixed(2)}
                </div>
                <div
                  className={`text-sm ${
                    item.current_stock <= item.min_stock
                      ? "text-red-400"
                      : "text-emerald-400"
                  }`}
                >
                  {item.current_stock} / {item.min_stock} in stock
                </div>
                {item.current_stock <= item.min_stock && (
                  <div className="mt-1 flex items-center justify-end gap-1 text-xs text-amber-400">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Reorder suggested
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {currentVehicle && (
        <PartFormModal
          open={showForm}
          vehicle={currentVehicle}
          initial={editing}
          onClose={() => {
            setShowForm(false);
            setEditing(null);
          }}
          onSave={async (item) => {
            try {
              await handleSaveForm(item);
            } catch (err) {
              alert(err instanceof Error ? err.message : "Could not save part");
              throw err;
            }
          }}
        />
      )}
    </div>
  );
}
