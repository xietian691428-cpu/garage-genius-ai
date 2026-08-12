"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Trash2,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { VehicleInfo } from "@/lib/types/chat";
import type { ShopReportListItem, ShopReportPayload } from "@/lib/types/shop-report";
import {
  defaultShopReportFileName,
  exportShopReportPdf,
} from "@/lib/shop-report/export-pdf";

type ShopReportQuotaState = {
  limit: number | null;
  used: number;
  remaining: number | null;
  unlimited: boolean;
  periodYm?: string;
};

type Props = {
  vehicle: VehicleInfo | null;
  loading?: boolean;
};

export default function ShopReportsPanel({ vehicle, loading }: Props) {
  const { t } = useTranslation();
  const [reports, setReports] = useState<ShopReportListItem[]>([]);
  const [quota, setQuota] = useState<ShopReportQuotaState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!vehicle?.id) {
      setReports([]);
      setQuota(null);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError(t("shopReport.panelSignIn"));
        return;
      }
      const headers = { Authorization: `Bearer ${session.access_token}` };
      const [listRes, quotaRes] = await Promise.all([
        fetch(
          `/api/shop-report/list?vehicleId=${encodeURIComponent(vehicle.id)}`,
          { headers },
        ),
        fetch("/api/shop-report/quota", { headers }),
      ]);
      const data = (await listRes.json()) as {
        reports?: ShopReportListItem[];
        error?: string;
      };
      if (!listRes.ok) {
        throw new Error(data.error || t("shopReport.panelLoadFailed"));
      }
      setReports(data.reports || []);
      if (quotaRes.ok) {
        const quotaData = (await quotaRes.json()) as {
          quota?: ShopReportQuotaState;
        };
        if (quotaData.quota) setQuota(quotaData.quota);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("shopReport.panelLoadFailed"),
      );
      setReports([]);
    } finally {
      setBusy(false);
    }
  }, [vehicle?.id, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const authHeaders = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Sign in required.");
    return {
      Authorization: `Bearer ${session.access_token}`,
    };
  };

  const downloadReport = async (id: string) => {
    setActionId(id);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/shop-report/${id}`, { headers });
      const data = (await res.json()) as {
        payload?: ShopReportPayload;
        error?: string;
      };
      if (!res.ok || !data.payload) {
        throw new Error(data.error || "Could not open report.");
      }
      exportShopReportPdf(data.payload, {
        fileName: defaultShopReportFileName(data.payload),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed.");
    } finally {
      setActionId(null);
    }
  };

  const deleteReport = async (id: string) => {
    if (!window.confirm("Delete this shop report? The share link will stop working.")) {
      return;
    }
    setActionId(id);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/shop-report/${id}`, {
        method: "DELETE",
        headers,
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error || "Delete failed.");
      }
      setReports((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setActionId(null);
    }
  };

  if (loading) {
    return (
      <section className="rounded-3xl border border-slate-800 bg-[#111827] p-5">
        <p className="text-sm text-slate-500">Loading vehicle…</p>
      </section>
    );
  }

  if (!vehicle) {
    return (
      <section className="rounded-3xl border border-slate-800 bg-[#111827] p-5">
        <h2 className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Shop Reports
        </h2>
        <p className="mt-2 text-sm text-slate-400">
          Add a vehicle to your garage, then export a shop handoff from Chat or
          Coach. Reports will appear here.
        </p>
      </section>
    );
  }

  return (
    <section
      data-testid="shop-reports-list"
      className="rounded-3xl border border-slate-800 bg-[#111827] p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Shop Reports
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            Owner Diagnostic Summaries for{" "}
            <span className="text-slate-200">
              {vehicle.year} {vehicle.make} {vehicle.model}
            </span>
          </p>
          {quota?.unlimited ? (
            <p className="mt-1 text-xs text-emerald-300/90">
              {t("shopReport.panelUnlimited")}
            </p>
          ) : quota && !quota.unlimited && quota.remaining != null ? (
            <p className="mt-1 text-xs text-slate-500">
              {t("shopReport.panelRemaining", {
                remaining: quota.remaining,
              })}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="text-xs text-cyan-400 hover:underline"
        >
          Refresh
        </button>
      </div>

      {error && (
        <p className="mt-3 text-sm text-rose-400" role="alert">
          {error}
        </p>
      )}

      {busy && reports.length === 0 ? (
        <div className="mt-4 flex items-center gap-2 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading reports…
        </div>
      ) : null}

      {!busy && reports.length === 0 && !error ? (
        <div className="mt-4 rounded-2xl border border-dashed border-slate-700 px-4 py-6 text-center">
          <FileText className="mx-auto h-8 w-8 text-slate-600" />
          <p className="mt-2 text-sm font-medium text-slate-300">
            No shop reports yet
          </p>
          <p className="mt-1 text-xs text-slate-500">
            From Chat, tap Generate Shop Report after a diagnosis — or finish a
            Coach guide and choose Export for Shop.
          </p>
        </div>
      ) : null}

      <ul className="mt-4 space-y-2">
        {reports.map((r) => (
          <li
            key={r.id}
            className="rounded-2xl border border-slate-800 bg-slate-900/50 px-3 py-3"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-white">
                  #{r.reportCode}
                  <span
                    className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      r.status === "active"
                        ? "bg-emerald-500/15 text-emerald-300"
                        : "bg-slate-700 text-slate-400"
                    }`}
                  >
                    {r.status === "active" ? "Active link" : "Expired"}
                  </span>
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {new Date(r.createdAt).toLocaleString()} · {r.source}
                </p>
                <p className="mt-1 text-xs text-cyan-300/90">
                  {r.codes.length > 0
                    ? r.codes.join(", ")
                    : "No DTCs on file"}
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {r.publicUrl ? (
                  <a
                    href={r.publicUrl}
                    target="_blank"
                    rel="noreferrer"
                    data-testid="shop-report-view"
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2 py-1.5 text-[11px] text-slate-200 hover:border-cyan-500/40"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    View
                  </a>
                ) : (
                  <span className="inline-flex items-center rounded-lg border border-slate-800 px-2 py-1.5 text-[11px] text-slate-600">
                    View unavailable
                  </span>
                )}
                <button
                  type="button"
                  disabled={actionId === r.id}
                  onClick={() => void downloadReport(r.id)}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2 py-1.5 text-[11px] text-slate-200 hover:border-cyan-500/40 disabled:opacity-50"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download
                </button>
                <button
                  type="button"
                  data-testid="shop-report-delete"
                  disabled={actionId === r.id}
                  onClick={() => void deleteReport(r.id)}
                  className="inline-flex items-center gap-1 rounded-lg border border-rose-900/50 px-2 py-1.5 text-[11px] text-rose-300 hover:bg-rose-950/40 disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
