"use client";

import { useCallback, useEffect, useState } from "react";
import {
  inventoryService,
  isLowStockItem,
  migrateFromLocalStorage,
  type InventoryUpsert,
} from "@/lib/supabase-inventory";
import type { InventoryItem as DbInventoryItem } from "@/lib/types/inventory";
import type { InventoryItem as FormInventoryItem } from "@/lib/types/parts";
import { normalizeInventoryCategory } from "@/lib/types/parts";
import type { VehicleInfo } from "@/lib/types/chat";
import { formatVehiclePickerLabel } from "@/lib/types/vehicle-market";
import { AlertTriangle, Package, Plus, Trash2 } from "lucide-react";
import PartFormModal from "./PartFormModal";

type Props = {
  vehicles: VehicleInfo[];
  currentVehicle: VehicleInfo | null;
  vehiclesLoading?: boolean;
  onVehicleChange: (vehicle: VehicleInfo) => void | Promise<void>;
};

function isCloudRowId(id: string | undefined | null): boolean {
  if (!id) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    id,
  );
}

function formToDb(item: FormInventoryItem, vehicleId: string): InventoryUpsert {
  return {
    ...(isCloudRowId(item.id) ? { id: item.id } : {}),
    vehicle_id: vehicleId,
    oem_number: item.oemNumber?.trim() || undefined,
    brand: item.brand?.trim() || "Unknown",
    name: item.name.trim(),
    category: normalizeInventoryCategory(item.category, item.name),
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
    if (filter === "low-stock") return isLowStockItem(item);
    if (filter === "all") return true;
    return item.category === filter;
  });

  const lowStockCount = items.filter(isLowStockItem).length;

  const handleSaveForm = async (formItem: FormInventoryItem) => {
    if (!vehicleId) throw new Error("No vehicle selected");
    await inventoryService.upsertItem(formToDb(formItem, vehicleId));
    setEditing(null);
    await loadInventory(vehicleId);
  };

  const handleDelete = async (
    e: React.MouseEvent,
    item: DbInventoryItem,
  ) => {
    e.stopPropagation();
    if (!vehicleId) return;
    if (!confirm(`Delete “${item.name}” from this vehicle’s inventory?`)) {
      return;
    }
    try {
      await inventoryService.remove(item.id);
      await loadInventory(vehicleId);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not delete part");
    }
  };

  const vehicleLabel = currentVehicle
    ? formatVehiclePickerLabel(currentVehicle)
    : vehiclesLoading
      ? "Loading garage…"
      : "No vehicle selected";

  return (
    <div className="panel-scroll min-h-0 flex-1 overflow-y-auto overscroll-y-contain p-4 pb-[var(--content-pad-bottom)] sm:p-8 lg:pb-8">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold sm:text-4xl">Parts</h1>
          <p className="text-slate-400">
            {vehicleLabel} — stock and wishlist for this car
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
                    {formatVehiclePickerLabel(v)}
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
          <Plus className="h-5 w-5" /> Add part
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

      <div className="-mx-1 mb-6 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {[
          "all",
          "low-stock",
          "brake",
          "engine",
          "filter",
          "consumable",
          "suspension",
          "electrical",
          "other",
        ].map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`shrink-0 rounded-full px-4 py-2 text-sm capitalize transition-colors ${
              filter === f
                ? "bg-cyan-500 text-black"
                : "bg-slate-800 text-slate-200 hover:bg-slate-700"
            }`}
          >
            {f === "low-stock" ? `Low stock (${lowStockCount})` : f}
          </button>
        ))}
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
          {filteredItems.map((item) => {
            const low = isLowStockItem(item);
            return (
              <div
                key={item.id}
                className="flex w-full items-center justify-between gap-3 rounded-3xl border border-slate-700 bg-slate-900 p-6 transition-colors hover:border-cyan-400/50"
              >
                <button
                  type="button"
                  onClick={() => {
                    if (!currentVehicle) return;
                    setEditing(dbToForm(item, currentVehicle.id));
                    setShowForm(true);
                  }}
                  className="flex min-w-0 flex-1 items-center gap-6 text-left"
                >
                  <Package className="h-10 w-10 shrink-0 text-cyan-400" />
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold">{item.name}</h3>
                    <p className="text-sm text-slate-400">
                      {item.brand}
                      {item.oem_number ? ` • ${item.oem_number}` : ""}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {item.location}
                      {item.location === "Wishlist" ? " · not purchased yet" : ""}
                    </p>
                  </div>
                </button>

                <div className="flex shrink-0 items-center gap-3">
                  <div className="text-right">
                    <div className="text-2xl font-bold">
                      ${Number(item.price).toFixed(2)}
                    </div>
                    <div
                      className={`text-sm ${
                        low ? "text-red-400" : "text-emerald-400"
                      }`}
                    >
                      {item.current_stock} / {item.min_stock} in stock
                    </div>
                    {low && (
                      <div className="mt-1 flex items-center justify-end gap-1 text-xs text-amber-400">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Reorder suggested
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={(e) => void handleDelete(e, item)}
                    className="rounded-xl p-2.5 text-slate-500 hover:bg-slate-800 hover:text-red-400"
                    aria-label={`Delete ${item.name}`}
                    title="Delete"
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                </div>
              </div>
            );
          })}
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
