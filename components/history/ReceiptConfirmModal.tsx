"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, FileText, Image as ImageIcon, Loader2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { VehicleInfo } from "@/lib/types/chat";
import type { MaintenanceRecord } from "@/lib/types/maintenance";
import { MAINTENANCE_CATEGORIES } from "@/lib/types/maintenance";
import type { ReceiptVisionAnalysis } from "@/lib/types/receipt";
import { maintenanceService } from "@/lib/maintenance-records";
import {
  draftFromReceiptAnalysis,
  inputFromDraft,
  partsToText,
} from "@/lib/receipt-parse";
import { supabase } from "@/lib/supabase";
import { compressImageDataUrl } from "@/lib/image";
import CameraCapture from "@/components/chat/CameraCapture";
import { useAiConsentGate } from "@/components/legal/AiConsentProvider";

type Draft = {
  vehicleId: string;
  title: string;
  category: string;
  performedAt: string;
  mileage: string;
  costUsd: string;
  partsText: string;
  shopName: string;
  notes: string;
  source: "manual" | "receipt";
};

type Props = {
  open: boolean;
  onClose: () => void;
  vehicles: VehicleInfo[];
  defaultVehicleId?: string | null;
  /** Prefill image to analyze immediately */
  initialImage?: string | null;
  /** Edit existing record */
  editing?: MaintenanceRecord | null;
  /** Start in camera/gallery pick mode */
  mode?: "scan" | "manual" | "edit";
  onSaved: (record: MaintenanceRecord) => void;
};

function draftFromRecord(record: MaintenanceRecord): Draft {
  return {
    vehicleId: record.vehicleId,
    title: record.title,
    category: String(record.category || "general"),
    performedAt: record.performedAt.slice(0, 10),
    mileage: record.mileage != null ? String(record.mileage) : "",
    costUsd:
      record.costCents != null ? (record.costCents / 100).toFixed(2) : "",
    partsText: partsToText(record.partsUsed),
    shopName: record.shopName || "",
    notes: record.notes || "",
    source: record.source === "receipt" ? "receipt" : "manual",
  };
}

export default function ReceiptConfirmModal({
  open,
  onClose,
  vehicles,
  defaultVehicleId,
  initialImage = null,
  editing = null,
  mode = "scan",
  onSaved,
}: Props) {
  const { t } = useTranslation();
  const { ensureConsent } = useAiConsentGate();
  const galleryRef = useRef<HTMLInputElement>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visionNote, setVisionNote] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [step, setStep] = useState<"pick" | "form">(
    mode === "manual" || mode === "edit" || editing ? "form" : "pick",
  );
  const [draft, setDraft] = useState<Draft>(() => ({
    vehicleId: defaultVehicleId || vehicles[0]?.id || "",
    title: "",
    category: "general",
    performedAt: new Date().toISOString().slice(0, 10),
    mileage: "",
    costUsd: "",
    partsText: "",
    shopName: "",
    notes: "",
    source: "manual",
  }));

  useEffect(() => {
    if (!open) return;
    setError(null);
    setVisionNote(null);
    if (editing) {
      setDraft(draftFromRecord(editing));
      setStep("form");
      setPreview(null);
      return;
    }
    if (mode === "manual") {
      setDraft({
        vehicleId: defaultVehicleId || vehicles[0]?.id || "",
        title: "",
        category: "general",
        performedAt: new Date().toISOString().slice(0, 10),
        mileage: "",
        costUsd: "",
        partsText: "",
        shopName: "",
        notes: "",
        source: "manual",
      });
      setStep("form");
      setPreview(null);
      return;
    }
    setStep("pick");
    setPreview(null);
    setDraft((d) => ({
      ...d,
      vehicleId: defaultVehicleId || vehicles[0]?.id || d.vehicleId,
      source: "receipt",
    }));
    if (initialImage) {
      void analyzeImage(initialImage);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when opened
  }, [open, editing?.id, mode, initialImage]);

  const analyzeImage = async (imageDataUrl: string) => {
    setAnalyzing(true);
    setError(null);
    setVisionNote(null);
    try {
      if (!(await ensureConsent())) return;
      const compressed = await compressImageDataUrl(imageDataUrl);
      setPreview(compressed);
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error(t("history.signInRequired"));

      const activeVehicle =
        vehicles.find((v) => v.id === (draft.vehicleId || defaultVehicleId)) ||
        vehicles[0];

      const res = await fetch("/api/vision/analyze-receipt", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          image: compressed,
          vehicle: activeVehicle
            ? {
                year: activeVehicle.year,
                make: activeVehicle.make,
                model: activeVehicle.model,
                market: activeVehicle.market,
                engine: activeVehicle.engine,
              }
            : undefined,
        }),
      });

      let json: {
        success?: boolean;
        data?: ReceiptVisionAnalysis;
        error?: string;
      } & Partial<ReceiptVisionAnalysis>;
      try {
        json = (await res.json()) as typeof json;
      } catch {
        throw new Error(t("history.analyzeFailed"));
      }
      if (!res.ok) {
        throw new Error(json.error || t("history.analyzeFailed"));
      }

      const analysis = (json.data ?? json) as ReceiptVisionAnalysis;
      const next = draftFromReceiptAnalysis(
        analysis,
        draft.vehicleId || defaultVehicleId || vehicles[0]?.id || "",
      );
      setDraft(next);
      setStep("form");
      if (analysis.confidence === "low") {
        setVisionNote(t("history.lowConfidence"));
      } else {
        setVisionNote(t("history.reviewExtracted"));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("history.analyzeFailed"));
      setStep("form");
      setDraft((d) => ({
        ...d,
        source: "receipt",
        title: d.title || t("history.receiptFallbackTitle"),
      }));
      setVisionNote(t("history.manualFallback"));
    } finally {
      setAnalyzing(false);
      setCameraOpen(false);
    }
  };

  if (!open) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.title.trim()) {
      setError(t("history.titleRequired"));
      return;
    }
    if (!draft.vehicleId) {
      setError(t("history.vehicleRequired"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const input = inputFromDraft(draft);
      const record = editing
        ? await maintenanceService.update(editing.id, input)
        : await maintenanceService.create(input);
      onSaved(record);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("history.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal
        aria-labelledby="receipt-modal-title"
        className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-slate-700 bg-[#0f172a] sm:rounded-3xl"
      >
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <h2
            id="receipt-modal-title"
            className="flex items-center gap-2 text-base font-semibold text-white"
          >
            <FileText className="h-5 w-5 text-cyan-400" aria-hidden />
            {editing
              ? t("history.editRecord")
              : mode === "manual"
                ? t("history.addRecord")
                : t("history.scanReceipt")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-800 hover:text-white"
            aria-label={t("common.close")}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {analyzing && (
            <div className="mb-4 flex items-center gap-2 rounded-2xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-3 text-sm text-cyan-100">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("history.analyzing")}
            </div>
          )}

          {step === "pick" && !analyzing && (
            <div className="space-y-3">
              <p className="text-sm text-slate-400">{t("history.scanHint")}</p>
              <button
                type="button"
                onClick={() => setCameraOpen(true)}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-cyan-500 px-4 py-3 text-sm font-semibold text-black hover:bg-cyan-400"
              >
                <Camera className="h-5 w-5" />
                {t("history.takePhoto")}
              </button>
              <button
                type="button"
                onClick={() => galleryRef.current?.click()}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-600 bg-slate-900 px-4 py-3 text-sm font-medium text-white hover:border-cyan-500/50"
              >
                <ImageIcon className="h-5 w-5" />
                {t("history.chooseGallery")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setStep("form");
                  setDraft((d) => ({ ...d, source: "manual" }));
                  setVisionNote(t("history.manualFallback"));
                }}
                className="w-full text-center text-sm text-slate-400 underline-offset-2 hover:text-slate-200 hover:underline"
              >
                {t("history.enterManually")}
              </button>
              <input
                ref={galleryRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = () => {
                    if (typeof reader.result === "string") {
                      void analyzeImage(reader.result);
                    }
                  };
                  reader.readAsDataURL(file);
                }}
              />
            </div>
          )}

          {step === "form" && (
            <form id="receipt-form" onSubmit={(e) => void handleSave(e)} className="space-y-3">
              {preview && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={preview}
                  alt=""
                  className="mb-2 max-h-36 w-full rounded-xl object-cover"
                />
              )}
              {visionNote && (
                <p className="rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2 text-xs text-slate-300">
                  {visionNote}
                </p>
              )}
              {error && (
                <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                  {error}
                </p>
              )}

              <div>
                <label className="mb-1 block text-xs text-slate-400">
                  {t("history.vehicle")}
                </label>
                <select
                  value={draft.vehicleId}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, vehicleId: e.target.value }))
                  }
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
                <label className="mb-1 block text-xs text-slate-400">
                  {t("history.jobTitle")}
                </label>
                <input
                  required
                  value={draft.title}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, title: e.target.value }))
                  }
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                  placeholder={t("history.jobTitlePlaceholder")}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs text-slate-400">
                    {t("history.category")}
                  </label>
                  <select
                    value={draft.category}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, category: e.target.value }))
                    }
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm capitalize text-white"
                  >
                    {MAINTENANCE_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-slate-400">
                    {t("history.date")}
                  </label>
                  <input
                    type="date"
                    required
                    value={draft.performedAt}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, performedAt: e.target.value }))
                    }
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs text-slate-400">
                    {t("history.mileage")}
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={draft.mileage}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, mileage: e.target.value }))
                    }
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-slate-400">
                    {t("history.costUsd")}
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={draft.costUsd}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, costUsd: e.target.value }))
                    }
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs text-slate-400">
                  {t("history.parts")}
                </label>
                <input
                  value={draft.partsText}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, partsText: e.target.value }))
                  }
                  placeholder={t("history.partsPlaceholder")}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-slate-400">
                  {t("history.shop")}
                </label>
                <input
                  value={draft.shopName}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, shopName: e.target.value }))
                  }
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-slate-400">
                  {t("history.notes")}
                </label>
                <textarea
                  rows={2}
                  value={draft.notes}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, notes: e.target.value }))
                  }
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                />
              </div>

              {mode === "scan" && !editing && (
                <button
                  type="button"
                  onClick={() => {
                    setStep("pick");
                    setError(null);
                  }}
                  className="text-sm text-cyan-300 underline-offset-2 hover:underline"
                >
                  {t("history.rescan")}
                </button>
              )}
            </form>
          )}
        </div>

        {step === "form" && (
          <div className="flex gap-2 border-t border-slate-800 px-4 py-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-2xl border border-slate-600 px-4 py-2.5 text-sm text-slate-200 hover:bg-slate-800"
            >
              {t("common.cancel")}
            </button>
            <button
              type="submit"
              form="receipt-form"
              disabled={saving || analyzing}
              className="flex-1 rounded-2xl bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-black hover:bg-cyan-400 disabled:opacity-50"
            >
              {saving ? t("history.saving") : t("history.saveRecord")}
            </button>
          </div>
        )}
      </div>

      {cameraOpen && (
        <CameraCapture
          open={cameraOpen}
          onClose={() => setCameraOpen(false)}
          onCapture={(dataUrl) => void analyzeImage(dataUrl)}
        />
      )}
    </div>
  );
}
