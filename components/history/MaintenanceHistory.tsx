"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FileText, History, Pencil, Plus, Trash2, Wrench } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { VehicleInfo } from "@/lib/types/chat";
import type { MaintenanceRecord } from "@/lib/types/maintenance";
import { maintenanceService } from "@/lib/maintenance-records";
import { FREE_MAINTENANCE_PREVIEW } from "@/lib/history-limits";
import { useSubscription } from "@/hooks/useSubscription";
import UpgradeModal from "@/components/ui/UpgradeModal";
import ReceiptConfirmModal from "@/components/history/ReceiptConfirmModal";
import {
  computeVehicleFamiliarity,
  type VehicleFamiliarity,
} from "@/lib/vehicle-familiarity";
import { partsToText } from "@/lib/receipt-parse";

type Props = {
  vehicles: VehicleInfo[];
  currentVehicle: VehicleInfo | null;
  vehiclesLoading?: boolean;
};

function formatMoney(cents?: number) {
  if (cents == null) return null;
  return `$${(cents / 100).toFixed(2)}`;
}

function sourceLabel(
  source: MaintenanceRecord["source"],
  t: (key: string) => string,
) {
  switch (source) {
    case "receipt":
      return t("history.sourceReceipt");
    case "chat":
      return t("history.sourceChat");
    case "parts":
      return t("history.sourceParts");
    default:
      return t("history.sourceManual");
  }
}

export default function MaintenanceHistory({
  vehicles,
  currentVehicle,
  vehiclesLoading = false,
}: Props) {
  const { t } = useTranslation();
  const { isFree, features } = useSubscription();
  const [vehicleFilter, setVehicleFilter] = useState<string>("current");
  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [modalMode, setModalMode] = useState<"scan" | "manual" | "edit" | null>(
    null,
  );
  const [editing, setEditing] = useState<MaintenanceRecord | null>(null);

  const canBrowseFullHistory = features.maintenanceHistory;

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

  const familiarity: VehicleFamiliarity | null = useMemo(() => {
    if (!currentVehicle?.id || vehicleFilter !== "current") return null;
    return computeVehicleFamiliarity(records, total);
  }, [currentVehicle?.id, vehicleFilter, records, total]);

  const handleDelete = async (id: string) => {
    if (!confirm(t("history.deleteConfirm"))) return;
    try {
      await maintenanceService.remove(id);
      await refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : t("history.deleteFailed"));
    }
  };

  const openManual = () => {
    if (!currentVehicle && vehicles.length === 0) {
      alert(t("history.vehicleRequired"));
      return;
    }
    setEditing(null);
    setModalMode("manual");
  };

  const openScan = () => {
    if (!currentVehicle && vehicles.length === 0) {
      alert(t("history.vehicleRequired"));
      return;
    }
    setEditing(null);
    setModalMode("scan");
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
            {t("history.title")}
          </h1>
          <p className="mt-1 text-sm text-slate-400">{t("history.subtitle")}</p>
          {familiarity && (
            <p className="mt-2 text-xs text-cyan-300/90">
              {t("history.familiarity")}: {familiarity.label} (
              {familiarity.score}/100)
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={openScan}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-black hover:bg-cyan-400"
          >
            <FileText className="h-4 w-4" />
            {t("history.scanReceipt")}
          </button>
          <button
            type="button"
            onClick={openManual}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-600 bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:border-cyan-500/40"
          >
            <Plus className="h-4 w-4" />
            {t("history.logService")}
          </button>
        </div>
      </div>

      {isFree && (
        <div className="mb-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          Free plan shows the latest {FREE_MAINTENANCE_PREVIEW} records
          {truncated ? ` (${total} total on file)` : ""}. Upgrade to Pro for full
          history and multi-vehicle filtering — cancel anytime.
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
          {t("history.vehicle")}
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

      {loading || vehiclesLoading ? (
        <div className="py-16 text-center text-slate-500">{t("common.loading")}</div>
      ) : error ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      ) : records.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center text-slate-500">
          <Wrench className="h-10 w-10 text-slate-600" />
          <p>No maintenance records yet for this filter.</p>
          <button
            type="button"
            onClick={openScan}
            className="text-sm text-cyan-400 hover:underline"
          >
            {t("history.scanReceipt")}
          </button>
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
                    <span className="rounded-full bg-slate-800/80 px-2 py-0.5 text-[10px] text-slate-500">
                      {sourceLabel(r.source, t)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {r.performedAt}
                    {r.mileage != null
                      ? ` · ${r.mileage.toLocaleString()} mi`
                      : ""}
                    {formatMoney(r.costCents)
                      ? ` · ${formatMoney(r.costCents)}`
                      : ""}
                    {r.shopName ? ` · ${r.shopName}` : ""}
                    {vehicleFilter === "all" || vehicleFilter === "current"
                      ? ` · ${vehicleLabel(r.vehicleId)}`
                      : ""}
                  </p>
                  {partsToText(r.partsUsed) ? (
                    <p className="mt-1 text-xs text-slate-400">
                      {t("history.parts")}: {partsToText(r.partsUsed)}
                    </p>
                  ) : null}
                  {r.notes && (
                    <p className="mt-2 text-sm text-slate-400">{r.notes}</p>
                  )}
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(r);
                      setModalMode("edit");
                    }}
                    className="rounded-lg p-2 text-slate-500 hover:bg-slate-800 hover:text-cyan-300"
                    aria-label={t("history.editRecord")}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(r.id)}
                    className="rounded-lg p-2 text-slate-500 hover:bg-slate-800 hover:text-red-400"
                    aria-label={t("history.deleteConfirm")}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ReceiptConfirmModal
        open={modalMode != null}
        onClose={() => {
          setModalMode(null);
          setEditing(null);
        }}
        vehicles={vehicles}
        defaultVehicleId={
          resolvedVehicleId || currentVehicle?.id || vehicles[0]?.id
        }
        mode={modalMode === "edit" ? "edit" : modalMode || "manual"}
        editing={editing}
        onSaved={() => {
          void refresh();
        }}
      />

      <UpgradeModal
        open={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        reason="history"
      />
    </div>
  );
}
