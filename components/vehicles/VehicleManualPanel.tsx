"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FileText, Trash2, Upload } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { VehicleInfo } from "@/lib/types/chat";
import { dismissManualNudge } from "@/lib/vehicle-manual-nudge";
import type { ManualExtractClientDto } from "@/lib/vehicle-manual-extract";

export type ManualClientDto = {
  id: string;
  vehicleId: string;
  filename: string;
  fileSize: number;
  pageCount: number | null;
  status: "processing" | "ready" | "failed";
  errorMessage: string | null;
  ymmGuess: { year?: number | null; make?: string | null; model?: string | null } | null;
  ymmMatch: "match" | "mismatch" | "unknown";
  userConfirmedMatch: boolean;
  searchable: boolean;
  createdAt: string;
  updatedAt: string;
};

type Props = {
  vehicle: VehicleInfo;
  compact?: boolean;
  onChanged?: (manual: ManualClientDto | null) => void;
  onFluidsSaved?: (vehicle: VehicleInfo) => void;
  onExtractsChanged?: (extracts: ManualExtractClientDto[]) => void;
};

async function authToken(): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

export default function VehicleManualPanel({
  vehicle,
  compact = false,
  onChanged,
  onFluidsSaved,
  onExtractsChanged,
}: Props) {
  const { t } = useTranslation();
  const [manual, setManual] = useState<ManualClientDto | null>(null);
  const [extracts, setExtracts] = useState<ManualExtractClientDto[]>([]);
  const [editId, setEditId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const token = await authToken();
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`/api/vehicles/${vehicle.id}/manual`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json()) as {
        manual?: ManualClientDto | null;
        extracts?: ManualExtractClientDto[];
      };
      const next = data.manual ?? null;
      const nextExtracts = data.extracts ?? [];
      setManual(next);
      setExtracts(nextExtracts);
      onChanged?.(next);
      onExtractsChanged?.(nextExtracts);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [vehicle.id, onChanged, onExtractsChanged]);

  useEffect(() => {
    setLoading(true);
    void refresh();
  }, [refresh]);

  const onUpload = async (file: File | null) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const token = await authToken();
      if (!token) throw new Error(t("ai.signInRequired"));
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(`/api/vehicles/${vehicle.id}/manual`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body,
      });
      const data = (await res.json()) as {
        manual?: ManualClientDto | null;
        extracts?: ManualExtractClientDto[];
        error?: string;
      };
      if (!res.ok && !data.manual) {
        throw new Error(data.error || t("vehicles.manualUploadFailed"));
      }
      setManual(data.manual ?? null);
      onChanged?.(data.manual ?? null);
      if (data.manual?.searchable) {
        dismissManualNudge(vehicle.id);
      }
      await refresh();
      if (data.error) setError(data.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("vehicles.manualUploadFailed"));
    } finally {
      setBusy(false);
    }
  };

  const onConfirmMismatch = async () => {
    setBusy(true);
    setError(null);
    try {
      const token = await authToken();
      if (!token) throw new Error(t("ai.signInRequired"));
      const res = await fetch(`/api/vehicles/${vehicle.id}/manual/confirm`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ confirm: true }),
      });
      const data = (await res.json()) as {
        manual?: ManualClientDto | null;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || t("vehicles.manualConfirmFailed"));
      setManual(data.manual ?? null);
      onChanged?.(data.manual ?? null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("vehicles.manualConfirmFailed"),
      );
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async () => {
    if (!confirm(t("vehicles.manualDeleteConfirm"))) return;
    setBusy(true);
    setError(null);
    try {
      const token = await authToken();
      if (!token) throw new Error(t("ai.signInRequired"));
      const res = await fetch(`/api/vehicles/${vehicle.id}/manual`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || t("vehicles.manualDeleteFailed"));
      }
      setManual(null);
      setExtracts([]);
      onChanged?.(null);
      onExtractsChanged?.([]);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("vehicles.manualDeleteFailed"),
      );
    } finally {
      setBusy(false);
    }
  };

  const resolveExtract = async (
    candidate: ManualExtractClientDto,
    action: "confirm" | "reject" | "edit",
    value?: string,
  ) => {
    setBusy(true);
    setError(null);
    try {
      const token = await authToken();
      if (!token) throw new Error(t("ai.signInRequired"));
      const res = await fetch(`/api/vehicles/${vehicle.id}/manual/extracts`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action,
          candidateId: candidate.id,
          value,
        }),
      });
      const data = (await res.json()) as {
        extracts?: ManualExtractClientDto[];
        vehicle?: VehicleInfo | null;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || t("vehicles.manualExtractFailed"));
      const nextExtracts = data.extracts ?? [];
      setExtracts(nextExtracts);
      setEditId(null);
      onExtractsChanged?.(nextExtracts);
      if (data.vehicle) onFluidsSaved?.(data.vehicle);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("vehicles.manualExtractFailed"),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={
        compact
          ? "rounded-xl border border-slate-700/80 bg-slate-900/40 p-3"
          : "rounded-2xl border border-slate-700 bg-slate-900/50 p-4"
      }
      data-testid="vehicle-manual-panel"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-100">
            <FileText className="h-4 w-4 text-cyan-300" />
            {t("vehicles.manualTitle")}
          </h3>
          <p className="mt-1 text-[11px] leading-snug text-slate-400">
            {t("vehicles.manualWhyUpload")}
          </p>
          <p className="mt-1.5 text-[11px] leading-snug text-slate-500">
            {t("vehicles.manualUploadSubtitle")}
          </p>
          <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
            {t("vehicles.manualUploadDisclaimer")}
          </p>
        </div>
      </div>

      {loading ? (
        <p className="mt-3 text-xs text-slate-500">{t("vehicles.manualLoading")}</p>
      ) : null}

      {!loading && manual ? (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-slate-200">
            <span className="font-medium">{manual.filename}</span>
            {manual.pageCount != null ? (
              <span className="text-slate-500"> · {manual.pageCount} pp</span>
            ) : null}
          </p>
          <p
            className="text-[11px] text-slate-400"
            data-testid="vehicle-manual-status"
            data-status={manual.status}
            data-match={manual.ymmMatch}
            data-searchable={manual.searchable ? "true" : "false"}
          >
            {manual.status === "ready"
              ? t("vehicles.manualReady")
              : manual.status === "processing"
                ? t("vehicles.manualProcessing")
                : t("vehicles.manualFailed")}
            {manual.ymmMatch === "mismatch"
              ? ` · ${t("vehicles.manualMismatch")}`
              : manual.ymmMatch === "unknown"
                ? ` · ${t("vehicles.manualUnknownYmm")}`
                : null}
          </p>
          {manual.errorMessage ? (
            <p className="text-[11px] text-amber-200">{manual.errorMessage}</p>
          ) : null}
          {extracts.length > 0 ? (
            <div
              className="rounded-xl border border-cyan-800/60 bg-cyan-950/30 p-3"
              data-testid="vehicle-manual-extract"
            >
              <p className="text-xs font-medium text-cyan-50">
                {t("vehicles.manualExtractTitle")}
              </p>
              <p className="mt-1 text-[11px] leading-snug text-slate-400">
                {t("vehicles.manualExtractHint")}
              </p>
              <ul className="mt-2 space-y-2">
                {extracts.map((ex) => (
                  <li
                    key={ex.id}
                    className="rounded-lg border border-slate-700/70 bg-slate-950/40 p-2"
                    data-testid={`vehicle-manual-extract-${ex.field}`}
                  >
                    <p className="text-xs text-slate-100">
                      {ex.field === "viscosity"
                        ? t("vehicles.manualExtractViscosity", { value: ex.value })
                        : t("vehicles.manualExtractCapacity", { value: ex.value })}
                    </p>
                    {ex.excerpt ? (
                      <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
                        {ex.excerpt}
                      </p>
                    ) : null}
                    {editId === ex.id ? (
                      <div className="mt-2 flex flex-col gap-2">
                        <input
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          className="min-h-[44px] rounded-lg border border-slate-600 bg-slate-900 px-2 text-sm text-slate-100"
                          data-testid="vehicle-manual-extract-edit-input"
                        />
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={busy || !editValue.trim()}
                            data-testid="vehicle-manual-extract-edit-save"
                            onClick={() =>
                              void resolveExtract(ex, "edit", editValue.trim())
                            }
                            className="inline-flex min-h-[44px] touch-manipulation items-center rounded-xl bg-cyan-600 px-3 text-xs font-semibold text-white disabled:opacity-50"
                          >
                            {t("vehicles.manualExtractSaveEdited")}
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => setEditId(null)}
                            className="inline-flex min-h-[44px] touch-manipulation items-center rounded-xl border border-slate-600 px-3 text-xs text-slate-200"
                          >
                            {t("ai.manualNudgeDismiss")}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          data-testid={`vehicle-manual-extract-confirm-${ex.field}`}
                          onClick={() => void resolveExtract(ex, "confirm")}
                          className="inline-flex min-h-[44px] touch-manipulation items-center rounded-xl bg-cyan-600 px-3 text-xs font-semibold text-white disabled:opacity-50"
                        >
                          {t("vehicles.manualExtractSave")}
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          data-testid={`vehicle-manual-extract-edit-${ex.field}`}
                          onClick={() => {
                            setEditId(ex.id);
                            setEditValue(ex.value);
                          }}
                          className="inline-flex min-h-[44px] touch-manipulation items-center rounded-xl border border-slate-600 px-3 text-xs text-slate-200 disabled:opacity-50"
                        >
                          {t("vehicles.manualExtractEdit")}
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          data-testid={`vehicle-manual-extract-reject-${ex.field}`}
                          onClick={() => void resolveExtract(ex, "reject")}
                          className="inline-flex min-h-[44px] touch-manipulation items-center rounded-xl border border-slate-700 px-3 text-xs text-slate-400 disabled:opacity-50"
                        >
                          {t("vehicles.manualExtractReject")}
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {manual.status === "ready" &&
          manual.ymmMatch === "mismatch" &&
          !manual.userConfirmedMatch ? (
            <div
              className="rounded-xl border border-amber-700/60 bg-amber-950/40 p-3"
              data-testid="vehicle-manual-mismatch"
            >
              <p className="text-xs leading-snug text-amber-50">
                {t("vehicles.manualMismatchWarn")}
              </p>
              <button
                type="button"
                data-testid="vehicle-manual-confirm"
                disabled={busy}
                onClick={() => void onConfirmMismatch()}
                className="mt-2 inline-flex min-h-[44px] touch-manipulation items-center rounded-xl bg-amber-600/90 px-3 text-xs font-semibold text-white disabled:opacity-50"
              >
                {t("vehicles.manualConfirmUse")}
              </button>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex min-h-[44px] cursor-pointer touch-manipulation items-center gap-1.5 rounded-xl border border-slate-600 px-3 text-xs font-medium text-slate-200 hover:bg-slate-800">
              <Upload className="h-3.5 w-3.5" />
              {t("vehicles.manualReplace")}
              <input
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                disabled={busy}
                data-testid="vehicle-manual-file"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  e.target.value = "";
                  void onUpload(f);
                }}
              />
            </label>
            <button
              type="button"
              data-testid="vehicle-manual-delete"
              disabled={busy}
              onClick={() => void onDelete()}
              className="inline-flex min-h-[44px] touch-manipulation items-center gap-1.5 rounded-xl border border-slate-700 px-3 text-xs text-rose-300 hover:bg-slate-800 disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t("vehicles.manualDelete")}
            </button>
          </div>
        </div>
      ) : null}

      {!loading && !manual ? (
        <div className="mt-3 space-y-2">
          <p className="text-[11px] leading-snug text-slate-500">
            {t("vehicles.manualEmpty")}
          </p>
          <label className="flex min-h-[48px] cursor-pointer touch-manipulation items-center justify-center gap-2 rounded-xl border border-dashed border-cyan-800/70 bg-cyan-950/20 px-3 text-sm font-medium text-cyan-100 hover:bg-cyan-950/40">
            <Upload className="h-4 w-4" />
            {busy ? t("vehicles.manualUploading") : t("vehicles.manualUploadCta")}
            <input
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              disabled={busy}
              data-testid="vehicle-manual-file"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                e.target.value = "";
                void onUpload(f);
              }}
            />
          </label>
        </div>
      ) : null}

      {error ? (
        <p className="mt-2 text-[11px] text-amber-200" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
