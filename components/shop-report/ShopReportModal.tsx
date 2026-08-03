"use client";

import { useMemo, useState } from "react";
import { Download, FileText, Share2, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { VehicleInfo } from "@/lib/types/chat";
import type {
  ShopReportChatMessage,
  ShopReportGenerateOptions,
  ShopReportPayload,
  ShopReportSource,
} from "@/lib/types/shop-report";
import { buildShopReportPreview } from "@/lib/shop-report/context";
import {
  defaultShopReportFileName,
  exportShopReportPdf,
} from "@/lib/shop-report/export-pdf";

type Props = {
  open: boolean;
  onClose: () => void;
  source: ShopReportSource;
  vehicle: VehicleInfo;
  messages?: ShopReportChatMessage[];
  coachContext?: {
    scenarioTitle: string;
    scenarioSlug?: string;
    completionText: string;
    lastStepText?: string;
  };
};

export default function ShopReportModal({
  open,
  onClose,
  source,
  vehicle,
  messages = [],
  coachContext,
}: Props) {
  const [includeFullVin, setIncludeFullVin] = useState(false);
  const [includeImages, setIncludeImages] = useState(false);
  const [includeInventory, setIncludeInventory] = useState(false);
  const [ownerNotes, setOwnerNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<ShopReportPayload | null>(null);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);

  const preview = useMemo(
    () =>
      buildShopReportPreview({
        vehicle,
        messages,
        coachText: [
          coachContext?.scenarioTitle,
          coachContext?.completionText,
          coachContext?.lastStepText,
        ]
          .filter(Boolean)
          .join("\n"),
      }),
    [vehicle, messages, coachContext],
  );

  if (!open) return null;

  const options: ShopReportGenerateOptions = {
    includeFullVin,
    includeImages,
    includeInventory,
    ownerNotes,
  };

  const generate = async () => {
    setError(null);
    setBusy(true);
    setPayload(null);
    setPdfBlob(null);
    try {
      if (!preview.hasEnoughData) {
        throw new Error(
          preview.reasonIfEmpty || "Please complete a diagnosis first.",
        );
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error("Sign in to generate a shop report.");
      }

      const res = await fetch("/api/shop-report/generate", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          source,
          vehicle,
          messages,
          coachContext,
          options,
        }),
      });

      const data = (await res.json()) as {
        payload?: ShopReportPayload;
        error?: string;
      };
      if (!res.ok || !data.payload) {
        throw new Error(data.error || "Could not generate report.");
      }

      const blob = exportShopReportPdf(data.payload);
      setPayload(data.payload);
      setPdfBlob(blob);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Shop report generation failed. Please retry.",
      );
    } finally {
      setBusy(false);
    }
  };

  const download = () => {
    if (!payload || !pdfBlob) return;
    const url = URL.createObjectURL(pdfBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = defaultShopReportFileName(payload);
    a.click();
    URL.revokeObjectURL(url);
  };

  const share = async () => {
    if (!payload || !pdfBlob) return;
    const file = new File([pdfBlob], defaultShopReportFileName(payload), {
      type: "application/pdf",
    });
    try {
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: "Owner Diagnostic Summary",
          text: `${preview.ymm} — Garage Genius shop handoff`,
          files: [file],
        });
        return;
      }
      if (navigator.share) {
        await navigator.share({
          title: "Owner Diagnostic Summary",
          text: "Download the PDF from Garage Genius, then share with your shop.",
        });
        return;
      }
      download();
    } catch {
      /* user cancelled */
    }
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-black/70 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="shop-report-title"
      onClick={onClose}
    >
      <div
        className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-3xl border border-slate-700 bg-[#111827] p-5 shadow-2xl sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-cyan-400/90">
              Shop handoff
            </p>
            <h2
              id="shop-report-title"
              className="mt-1 text-lg font-semibold text-white"
            >
              Generate Shop Report
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              Education summary for your technician — not a final diagnosis.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 rounded-2xl border border-slate-700 bg-slate-900/60 p-3 text-sm">
          <p className="font-medium text-white">{preview.ymm}</p>
          <p className="text-xs text-slate-400">{preview.mileageLabel}</p>
          <p className="mt-2 text-xs text-slate-300 line-clamp-3">
            {preview.symptomPreview}
          </p>
          {preview.codes.length > 0 && (
            <p className="mt-2 text-xs text-cyan-300">
              Codes: {preview.codes.join(", ")}
            </p>
          )}
        </div>

        {!payload && (
          <div className="mt-4 space-y-3">
            <label className="flex items-start gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                className="mt-1"
                checked={includeFullVin}
                onChange={(e) => setIncludeFullVin(e.target.checked)}
              />
              <span>
                Include full VIN
                <span className="block text-xs text-slate-500">
                  Default shows last 8 only.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm text-slate-500">
              <input
                type="checkbox"
                className="mt-1"
                checked={includeImages}
                onChange={(e) => setIncludeImages(e.target.checked)}
                disabled
              />
              <span>
                Include photos / screenshots
                <span className="block text-xs">Coming next — PDF text-only for MVP.</span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm text-slate-500">
              <input
                type="checkbox"
                className="mt-1"
                checked={includeInventory}
                onChange={(e) => setIncludeInventory(e.target.checked)}
                disabled
              />
              <span>
                Include parts inventory
                <span className="block text-xs">Coming next.</span>
              </span>
            </label>
            <div>
              <label className="text-xs font-medium text-slate-400">
                Owner notes (optional)
              </label>
              <textarea
                value={ownerNotes}
                onChange={(e) => setOwnerNotes(e.target.value.slice(0, 500))}
                rows={2}
                placeholder="One sentence for the shop…"
                className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white placeholder:text-slate-600"
              />
            </div>
          </div>
        )}

        {error && (
          <p className="mt-3 text-sm text-rose-400" role="alert">
            {error}
          </p>
        )}

        {busy && (
          <p className="mt-3 text-sm text-cyan-300">
            Preparing professional summary…
          </p>
        )}

        {payload && pdfBlob && (
          <div className="mt-4 space-y-3">
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
              Report #{payload.reportId} ready. Saved to your vehicle profile
              when archive is available.
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={download}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 py-3 text-sm font-semibold text-black hover:bg-cyan-400"
              >
                <Download className="h-4 w-4" />
                Download PDF
              </button>
              <button
                type="button"
                onClick={() => void share()}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-600 px-4 py-3 text-sm font-semibold text-slate-100 hover:bg-slate-800"
              >
                <Share2 className="h-4 w-4" />
                Share
              </button>
            </div>
            <p className="text-[11px] text-slate-500">
              Copy Link (30-day web report) ships in a later release.
            </p>
          </div>
        )}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-4 py-2.5 text-sm text-slate-400 hover:text-white"
          >
            Close
          </button>
          {!payload && (
            <button
              type="button"
              disabled={busy || !preview.hasEnoughData}
              onClick={() => void generate()}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-black hover:bg-cyan-400 disabled:opacity-50"
            >
              <FileText className="h-4 w-4" />
              {busy ? "Generating…" : "Generate PDF"}
            </button>
          )}
          {payload && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void generate()}
              className="rounded-xl border border-slate-600 px-4 py-2.5 text-sm text-slate-200 hover:bg-slate-800"
            >
              Regenerate
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
