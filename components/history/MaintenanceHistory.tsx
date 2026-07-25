"use client";

import { useCallback, useEffect, useState } from "react";
import { History, Plus, Trash2, Wrench } from "lucide-react";
import type { VehicleInfo } from "@/lib/types/chat";
import type { MaintenanceRecord } from "@/lib/types/maintenance";
import { maintenanceService } from "@/lib/maintenance-records";
import { FREE_MAINTENANCE_PREVIEW } from "@/lib/history-limits";
import { useSubscription } from "@/hooks/useSubscription";
import UpgradeModal from "@/components/ui/UpgradeModal";

const CATEGORIES = [
  "general",
  "oil",
  "brakes",
  "tires",
  "engine",
  "electrical",
  "suspension",
  "filter",
  "other",
] as const;

type Props = {
  vehicles: VehicleInfo[];
  currentVehicle: VehicleInfo | null;
  vehiclesLoading?: boolean;
};

function formatMoney(cents?: number) {
  if (cents == null) return null;
  return `$${(cents / 100).toFixed(2)}`;
}

export default function MaintenanceHistory({
  vehicles,
  currentVehicle,
  vehiclesLoading = false,
}: Props) {
  const { isPro, isFree, features } = useSubscription();
  const [vehicleFilter, setVehicleFilter] = useState<string>("current");
  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<string>("general");
  const [performedAt, setPerformedAt] = useState(
    () => new Date().toISOString().slice(0, 10),
  );
  const [mileage, setMileage] = useState("");
  const [cost, setCost] = useState("");
  const [notes, setNotes] = useState("");
  const [formVehicleId, setFormVehicleId] = useState(
    currentVehicle?.id ?? "",
  );

  const canBrowseFullHistory = features.maintenanceHistory;

  useEffect(() => {
    setFormVehicleId(currentVehicle?.id ?? "");
  }, [currentVehicle?.id]);

  // Free: force current-vehicle preview only
  useEffect(() => {
    if (!canBrowseFullHistory && vehicleFilter !== "current") {
      setVehicleFilter("current");
    }
  }, [canBrowseFullHistory, vehicleFilter]);

  const resolvedVehicleId =
    !canBrowseFullHistory || vehicleFilter === "current"
      ? currentVehicle?.id ?? null
      : vehicleFilter === "all"
        ? null
        : vehicleFilter;

  const refresh = useCallback(async () => {
    if (vehiclesLoading) return;
    if (!resolvedVehicleId && vehicleFilter === "current") {
      setRecords([]);
      setTotal(0);
      setTruncated(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await maintenanceService.list({
        vehicleId: resolvedVehicleId,
        isPro: features.maintenanceHistory,
      });
      setRecords(result.records);
      setTotal(result.total);
      setTruncated(result.truncated);
    } catch (err) {
      console.error("[MaintenanceHistory]", err);
      setError(
        err instanceof Error ? err.message : "Failed to load maintenance history",
      );
    } finally {
      setLoading(false);
    }
  }, [
    vehiclesLoading,
    resolvedVehicleId,
    vehicleFilter,
    features.maintenanceHistory,
  ]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    if (!features.maintenanceHistory) {
      setShowForm(false);
      return;
    }
    if (!formVehicleId) {
      alert("Add a vehicle to your garage before logging service.");
      return;
    }

    setSaving(true);
    try {
      const costNum = cost.trim() ? Number.parseFloat(cost) : NaN;
      await maintenanceService.create({
        vehicleId: formVehicleId,
        title: title.trim(),
        category,
        performedAt,
        mileage: mileage.trim() ? Number.parseInt(mileage, 10) : undefined,
        costCents: Number.isFinite(costNum)
          ? Math.round(costNum * 100)
          : undefined,
        notes: notes.trim() || undefined,
        source: "manual",
      });
      setTitle("");
      setNotes("");
      setMileage("");
      setCost("");
      setShowForm(false);
      await refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not save record");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!features.maintenanceHistory) return;
    if (!confirm("Delete this maintenance record?")) return;
    try {
      await maintenanceService.remove(id);
      await refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const vehicleLabel = (id: string) => {
    const v = vehicles.find((x) => x.id === id);
    if (!v) return "Vehicle";
    return `${v.name} · ${v.year} ${v.make} ${v.model}`;
  };

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-y-auto p-4 md:p-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-white md:text-3xl">
            <History className="h-7 w-7 text-cyan-400" aria-hidden />
            Maintenance History
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Service logs synced to your account, filtered by vehicle.
          </p>
        </div>

        {features.maintenanceHistory ? (
          <button
            type="button"
            onClick={() => setShowForm((o) => !o)}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-black hover:bg-cyan-400"
          >
            <Plus className="h-4 w-4" />
            Log service
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setShowUpgrade(true)}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-black hover:bg-cyan-400"
          >
            Unlock with Pro
          </button>
        )}
      </div>

      {isFree && (
        <div className="mb-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          Free plan shows the latest {FREE_MAINTENANCE_PREVIEW} records
          {truncated ? ` (${total} total on file)` : ""}. Upgrade to Pro for full
          history, multi-vehicle filtering, and logging — cancel anytime.
          <div className="mt-2">
            <button
              type="button"
              onClick={() => setShowUpgrade(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-black hover:bg-cyan-400"
            >
              Upgrade to Pro
            </button>
          </div>
        </div>
      )}

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Vehicle
        </label>
        <select
          value={vehicleFilter}
          onChange={(e) => setVehicleFilter(e.target.value)}
          disabled={vehiclesLoading || !features.maintenanceHistory}
          className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-60"
        >
          <option value="current">
            Current —{" "}
            {currentVehicle
              ? `${currentVehicle.year} ${currentVehicle.make} ${currentVehicle.model}`
              : "none selected"}
          </option>
          {features.maintenanceHistory && (
            <>
              <option value="all">All vehicles</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} · {v.year} {v.make} {v.model}
                </option>
              ))}
            </>
          )}
        </select>
      </div>

      {showForm && features.maintenanceHistory && (
        <form
          onSubmit={(e) => void handleCreate(e)}
          className="mb-6 grid gap-3 rounded-2xl border border-slate-800 bg-[#111827] p-4 md:grid-cols-2"
        >
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs text-slate-400">Title</label>
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Oil change, brake pads…"
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Vehicle</label>
            <select
              value={formVehicleId}
              onChange={(e) => setFormVehicleId(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            >
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} · {v.year} {v.make} {v.model}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white capitalize"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Date</label>
            <input
              type="date"
              required
              value={performedAt}
              onChange={(e) => setPerformedAt(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Mileage</label>
            <input
              type="number"
              min={0}
              value={mileage}
              onChange={(e) => setMileage(e.target.value)}
              placeholder="85000"
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Cost (USD)</label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              placeholder="42.99"
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            />
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs text-slate-400">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            />
          </div>
          <div className="flex gap-2 md:col-span-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-black disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save record"}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-300"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading || vehiclesLoading ? (
        <div className="py-16 text-center text-slate-500">Loading history…</div>
      ) : error ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      ) : records.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center text-slate-500">
          <Wrench className="h-10 w-10 text-slate-600" />
          <p>No maintenance records yet for this filter.</p>
          {features.maintenanceHistory && (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="text-sm text-cyan-400 hover:underline"
            >
              Log your first service
            </button>
          )}
        </div>
      ) : (
        <ul className="grid gap-3">
          {records.map((r) => (
            <li
              key={r.id}
              className="rounded-2xl border border-slate-800 bg-[#111827] px-4 py-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-white">{r.title}</h3>
                    <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-400">
                      {r.category}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {r.performedAt}
                    {r.mileage != null ? ` · ${r.mileage.toLocaleString()} mi` : ""}
                    {formatMoney(r.costCents)
                      ? ` · ${formatMoney(r.costCents)}`
                      : ""}
                    {vehicleFilter === "all" || vehicleFilter === "current"
                      ? ` · ${vehicleLabel(r.vehicleId)}`
                      : ""}
                  </p>
                  {r.notes && (
                    <p className="mt-2 text-sm text-slate-400">{r.notes}</p>
                  )}
                </div>
                {isPro && (
                  <button
                    type="button"
                    onClick={() => void handleDelete(r.id)}
                    className="rounded-lg p-2 text-slate-500 hover:bg-slate-800 hover:text-red-400"
                    aria-label="Delete record"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <UpgradeModal
        open={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        reason="history"
      />
    </div>
  );
}
