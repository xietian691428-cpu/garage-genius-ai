"use client";

import { useMemo, useState } from "react";
import { Check, Copy, Download, FileText, Link2, Share2, X } from "lucide-react";
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
  collectMessageImages,
  prepareShopReportImages,
} from "@/lib/shop-report/images";
import {
  defaultShopReportFileName,
  exportShopReportPdf,
} from "@/lib/shop-report/export-pdf";
import { formatAiHttpError } from "@/lib/format-ai-http-error";

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
  const [toast, setToast] = useState<string | null>(null);
  const [payload, setPayload] = useState<ShopReportPayload | null>(null);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [publicUrl, setPublicUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const availableImages = useMemo(
    () => collectMessageImages(messages, 3),
    [messages],
  );

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

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2200);
  };

  const generate = async () => {
    setError(null);
    setBusy(true);
    setPayload(null);
    setPdfBlob(null);
    setPublicUrl(null);
    setCopied(false);
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

      let images: string[] = [];
      if (includeImages && availableImages.length > 0) {
        images = await prepareShopReportImages(availableImages, 3);
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
          images,
        }),
      });

      const data = (await res.json()) as {
        payload?: ShopReportPayload;
        public_url?: string | null;
        error?: string;
        code?: string;
      };
      if (!res.ok || !data.payload) {
        throw new Error(
          formatAiHttpError({
            status: res.status,
            code: data.code,
            error: data.error,
            fallback: "Could not generate report. Please try again.",
          }),
        );
      }

      const blob = exportShopReportPdf(data.payload);
      setPayload(data.payload);
      setPdfBlob(blob);
      setPublicUrl(data.public_url ?? null);
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

  const copyLink = async () => {
    if (!publicUrl) {
      showToast("Share link unavailable — apply migration 034 and regenerate.");
      return;
    }
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      showToast("Link copied — valid for 30 days");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast("Could not copy link");
    }
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
          text: publicUrl
            ? `${preview.ymm} — ${publicUrl}`
            : `${preview.ymm} — Garage Genius shop handoff`,
          files: [file],
        });
        return;
      }
      if (navigator.share && publicUrl) {
        await navigator.share({
          title: "Owner Diagnostic Summary",
          text: publicUrl,
          url: publicUrl,
        });
        return;
      }
      download();
    } catch {
      /* cancelled */
    }
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center overflow-y-auto bg-black/70 p-4 sm:items-start sm:pt-[max(1.5rem,env(safe-area-inset-top))] sm:pb-[max(1.5rem,env(safe-area-inset-bottom))]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="shop-report-title"
      onClick={onClose}
      data-testid="shop-report-modal"
    >
      <div
        className="my-auto max-h-[min(90dvh,100%)] w-full max-w-lg overflow-y-auto rounded-3xl border border-slate-700 bg-[#111827] p-5 shadow-2xl sm:p-6"
        style={{ WebkitOverflowScrolling: "touch" }}
        onClick={(e) => e.stopPropagation()}
      >
        {toast && (
          <div className="mb-3 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-center text-xs font-medium text-cyan-200">
            {toast}
          </div>
        )}

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
            className="min-h-[44px] min-w-[44px] rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 rounded-2xl border border-slate-700 bg-slate-900/60 p-3 text-sm">
          <p className="font-medium text-white">{preview.ymm}</p>
          <p className="text-xs text-slate-400">{preview.mileageLabel}</p>
          {vehicle.licensePlate ? (
            <p className="text-xs text-slate-400">
              Plate {vehicle.licensePlate}
            </p>
          ) : null}
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
                data-testid="shop-report-include-vin"
                className="mt-1"
                checked={includeFullVin}
                onChange={(e) => setIncludeFullVin(e.target.checked)}
              />
              <span>
                Include full VIN in PDF
                <span className="block text-xs text-slate-500">
                  Default / share link show last 8 only.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                data-testid="shop-report-include-images"
                className="mt-1"
                checked={includeImages}
                onChange={(e) => setIncludeImages(e.target.checked)}
                disabled={availableImages.length === 0}
              />
              <span>
                Include screenshots
                <span className="block text-xs text-slate-500">
                  {availableImages.length === 0
                    ? "No photos in this chat yet."
                    : `Up to ${Math.min(3, availableImages.length)} image(s) on PDF page 2.`}
                </span>
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
                <span className="block text-xs">Coming later.</span>
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
              Report #{payload.reportId} ready
              {publicUrl ? " · 30-day share link available" : ""}.
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                data-testid="shop-report-download"
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
            <button
              type="button"
              data-testid="shop-report-copy-link"
              onClick={() => void copyLink()}
              disabled={!publicUrl}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-4 py-3 text-sm font-semibold text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-40"
            >
              {copied ? (
                <Check className="h-4 w-4" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
              <Link2 className="h-4 w-4" />
              {copied ? "Copied" : "Copy Link"}
            </button>
            {publicUrl ? (
              <p className="break-all text-[11px] text-slate-500">{publicUrl}</p>
            ) : (
              <p className="text-[11px] text-amber-300/90">
                Share link needs migration 034 + successful archive.
              </p>
            )}
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
              data-testid="shop-report-generate"
              disabled={busy || !preview.hasEnoughData}
              onClick={() => void generate()}
              className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-black hover:bg-cyan-400 disabled:opacity-50"
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
