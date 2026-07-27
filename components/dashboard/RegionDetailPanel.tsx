"use client";

import type { ComponentType, CSSProperties } from "react";
import {
  AlertTriangle,
  Battery,
  Camera,
  Cog,
  Disc,
  ExternalLink,
  Gauge,
  Loader2,
  MessageSquare,
  MoveVertical,
  RefreshCw,
  Shield,
  Wrench,
  X,
  Zap,
  Play,
} from "lucide-react";
import type { DashboardRegion, RegionInspection } from "@/lib/types/dashboard";
import type { VehicleInfo } from "@/lib/types/chat";
import { getInspectionRecommendations, recommendationsToPartsData } from "@/lib/dashboard-parts";
import PartsRecommendationTable from "../parts/PartsRecommendationTable";

const REGION_ICONS: Record<
  string,
  ComponentType<{ className?: string; style?: CSSProperties }>
> = {
  engine: Cog,
  brakes: Disc,
  suspension: MoveVertical,
  battery: Battery,
  tires: Gauge,
};

function severityStyles(severity: string) {
  switch (severity) {
    case "high":
      return "border-red-500/50 bg-red-500/10 text-red-300";
    case "medium":
      return "border-amber-500/50 bg-amber-500/10 text-amber-300";
    default:
      return "border-emerald-500/50 bg-emerald-500/10 text-emerald-300";
  }
}

function difficultyStyles(difficulty: string) {
  switch (difficulty) {
    case "Hard":
      return "text-red-400";
    case "Medium":
      return "text-amber-400";
    default:
      return "text-emerald-400";
  }
}

interface Props {
  region: DashboardRegion;
  vehicle: VehicleInfo;
  symptoms: string;
  onSymptomsChange: (value: string) => void;
  inspection: RegionInspection | null;
  loading: boolean;
  error: string | null;
  fromCache: boolean;
  onClose: () => void;
  onRequestAI: () => void;
  onGeneralOverview: () => void;
  onRefreshAI: () => void;
  onAskAI: (prompt: string) => void;
}

export default function RegionDetailPanel({
  region,
  vehicle,
  symptoms,
  onSymptomsChange,
  inspection,
  loading,
  error,
  fromCache,
  onClose,
  onRequestAI,
  onGeneralOverview,
  onRefreshAI,
  onAskAI,
}: Props) {
  const Icon = REGION_ICONS[region.id] ?? Cog;

  const chatPrompt = `I'm inspecting the ${region.name} on my ${vehicle.year} ${vehicle.make} ${vehicle.model} (${vehicle.market ?? "US"} market).${symptoms.trim() ? ` Symptoms: ${symptoms.trim()}.` : ""} Please help me diagnose and plan DIY repairs for this area using ${vehicle.market ?? "US"}-spec manuals.`;

  const canRequestAI = symptoms.trim().length >= 3;

  const purchaseRecommendations = inspection
    ? getInspectionRecommendations(inspection, vehicle)
    : [];

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/95"
      role="dialog"
      aria-modal="true"
      aria-label={`${region.name} inspection`}
    >
      {/* Hero header */}
      <div
        className="relative shrink-0 overflow-hidden border-b border-slate-800"
        style={{
          background: `linear-gradient(135deg, ${region.color}22 0%, #0a0f1c 55%, #111827 100%)`,
        }}
      >
        <div className="absolute inset-0 opacity-20">
          <div
            className="absolute -right-10 -top-10 h-64 w-64 rounded-full blur-3xl"
            style={{ backgroundColor: region.color }}
          />
        </div>

        <div className="relative mx-auto flex max-w-5xl items-start justify-between gap-4 px-4 py-6 sm:px-8 sm:py-8">
          <div className="flex min-w-0 items-start gap-4 sm:gap-6">
            <div
              className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl sm:h-24 sm:w-24 sm:rounded-3xl"
              style={{
                backgroundColor: `${region.color}33`,
                border: `2px solid ${region.color}`,
              }}
            >
              <Icon className="h-8 w-8 sm:h-12 sm:w-12" style={{ color: region.color }} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-400">
                {vehicle.year} {vehicle.make} {vehicle.model} •{" "}
                {vehicle.mileage.toLocaleString()} mi
              </p>
              <h2 className="mt-1 text-2xl font-bold text-white sm:text-4xl">
                {region.name}
              </h2>
              <p className="mt-2 text-sm text-slate-400 sm:text-base">
                {region.description}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-xl border border-slate-700 p-2 text-slate-400 hover:bg-slate-800 hover:text-white"
            aria-label="Close"
          >
            <X size={24} />
          </button>
        </div>
      </div>

      {/* Symptom input + actions — AI 仅在用户明确请求时调用 */}
      <div className="shrink-0 border-b border-slate-800 bg-[#111827] px-4 py-4 sm:px-8">
        <div className="mx-auto max-w-5xl space-y-3">
          <div>
            <label
              htmlFor="symptoms"
              className="mb-2 block text-sm font-medium text-slate-300"
            >
              What&apos;s going on? (helps AI focus — saves tokens)
            </label>
            <input
              id="symptoms"
              type="text"
              value={symptoms}
              onChange={(e) => onSymptomsChange(e.target.value)}
              placeholder="Tap a hint below or type your symptoms..."
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-base outline-none focus:border-cyan-400"
            />
            <div className="mt-2 flex flex-wrap gap-2">
              {region.symptomHints.map((hint) => (
                <button
                  key={hint}
                  type="button"
                  onClick={() => onSymptomsChange(hint)}
                  className="rounded-full border border-slate-600 bg-slate-900 px-3 py-1.5 text-xs text-slate-300 transition-colors hover:border-cyan-500/50 hover:text-cyan-300 sm:text-sm"
                >
                  {hint}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={() => onAskAI(chatPrompt)}
              className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-5 font-semibold text-cyan-300 transition-colors hover:bg-cyan-500/20"
            >
              <MessageSquare className="h-5 w-5" />
              Chat Now (Free, Instant)
            </button>
            <button
              type="button"
              onClick={onRequestAI}
              disabled={loading || !canRequestAI}
              className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl bg-cyan-500 px-5 font-semibold text-black transition-colors hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Zap className="h-5 w-5" />
              )}
              {loading ? "Generating..." : "Get AI Guide"}
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <span>
              AI guide uses API — add symptoms first for best results
            </span>
            <button
              type="button"
              onClick={onGeneralOverview}
              disabled={loading}
              className="text-slate-400 underline-offset-2 hover:text-slate-300 hover:underline disabled:opacity-50"
            >
              General area overview (uses AI)
            </button>
          </div>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-8">
        <div className="mx-auto max-w-5xl space-y-8">
          {error && (
            <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-6 text-red-300">
              <AlertTriangle className="mb-2 h-6 w-6" />
              <p>{error}</p>
              <button
                type="button"
                onClick={onRefreshAI}
                disabled={loading}
                className="mt-4 rounded-xl bg-cyan-500 px-3 py-1.5 text-sm font-semibold text-black hover:bg-cyan-400 disabled:opacity-50"
              >
                Retry
              </button>
            </div>
          )}

          {/* 即时静态引导 — 零 API 成本 */}
          {!inspection && !loading && (
            <section
              className="rounded-3xl border p-6 sm:p-8"
              style={{
                borderColor: `${region.color}55`,
                background: `linear-gradient(135deg, ${region.color}12, #111827)`,
              }}
            >
              <h3 className="flex items-center gap-2 text-xl font-bold text-white">
                <Wrench className="h-6 w-6" style={{ color: region.color }} />
                Quick Check (No AI needed)
              </h3>
              <p className="mt-2 text-slate-400">
                Start here while you decide if you need a full AI guide for your{" "}
                {vehicle.year} {vehicle.make} {vehicle.model}.
              </p>
              <ol className="mt-6 space-y-4">
                {region.quickChecklist.map((item, index) => (
                  <li
                    key={item}
                    className="flex gap-4 rounded-2xl border border-slate-700 bg-slate-900/60 p-4"
                  >
                    <span
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg font-bold text-black"
                      style={{ backgroundColor: region.color }}
                    >
                      {index + 1}
                    </span>
                    <p className="pt-2 text-base text-slate-200">{item}</p>
                  </li>
                ))}
              </ol>
              <p className="mt-6 text-sm text-slate-500">
                Hundreds of parts live in this area — AI generates the specific
                ones for your car only when you tap &quot;Get AI Guide&quot; or
                open Chat.
              </p>
            </section>
          )}

          {fromCache && inspection && !loading && (
            <div className="flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
              <span>Showing saved guide — no API call needed</span>
              <button
                type="button"
                onClick={onRefreshAI}
                className="flex items-center gap-1 font-medium hover:text-emerald-200"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh
              </button>
            </div>
          )}

          {loading && !inspection && (
            <div className="space-y-6">
              <div className="h-32 animate-pulse rounded-3xl bg-slate-800" />
              <div className="grid gap-4 sm:grid-cols-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-28 animate-pulse rounded-2xl bg-slate-800" />
                ))}
              </div>
              <div className="h-48 animate-pulse rounded-3xl bg-slate-800" />
            </div>
          )}

          {inspection && (
            <>
              {/* Summary */}
              <section
                className="rounded-3xl border p-6 sm:p-8"
                style={{
                  borderColor: `${region.color}55`,
                  background: `linear-gradient(135deg, ${region.color}15, #111827)`,
                }}
              >
                <h3 className="text-xl font-bold text-white sm:text-2xl">
                  {inspection.title}
                </h3>
                <p className="mt-4 text-base leading-relaxed text-slate-300 sm:text-lg">
                  {inspection.summary}
                </p>
              </section>

              {/* Key parts grid */}
              {inspection.parts.length > 0 && (
                <section>
                  <h3 className="mb-4 flex items-center gap-2 text-xl font-semibold">
                    <Cog className="h-6 w-6 text-cyan-400" />
                    Key Components
                  </h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {inspection.parts.map((part) => (
                      <div
                        key={part.name}
                        className="rounded-2xl border border-slate-700 bg-[#111827] p-5"
                      >
                        <p className="text-lg font-semibold text-white">
                          {part.name}
                        </p>
                        <p className="mt-2 text-sm text-slate-400">{part.role}</p>
                        <p className="mt-3 text-xs font-medium uppercase tracking-wide text-cyan-400">
                          Typical lifespan: {part.lifespan}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Common issues */}
              {inspection.commonIssues.length > 0 && (
                <section>
                  <h3 className="mb-4 flex items-center gap-2 text-xl font-semibold">
                    <AlertTriangle className="h-6 w-6 text-amber-400" />
                    Common Issues
                  </h3>
                  <div className="space-y-3">
                    {inspection.commonIssues.map((issue) => (
                      <div
                        key={issue.issue}
                        className={`rounded-2xl border p-5 ${severityStyles(issue.severity)}`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <p className="text-base font-medium sm:text-lg">
                            {issue.issue}
                          </p>
                          <span className="shrink-0 rounded-full bg-black/30 px-3 py-1 text-sm font-bold">
                            {issue.probability}%
                          </span>
                        </div>
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/30">
                          <div
                            className="h-full rounded-full bg-current opacity-70"
                            style={{ width: `${Math.min(issue.probability, 100)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Repair steps timeline */}
              {inspection.repairSteps.length > 0 && (
                <section>
                  <h3 className="mb-4 flex items-center gap-2 text-xl font-semibold">
                    <Wrench className="h-6 w-6 text-cyan-400" />
                    DIY Inspection & Repair Steps
                  </h3>
                  <div className="space-y-4">
                    {inspection.repairSteps.map((step) => (
                      <div
                        key={step.step}
                        className="flex gap-4 rounded-2xl border border-slate-700 bg-[#111827] p-5 sm:gap-6 sm:p-6"
                      >
                        <div
                          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-xl font-bold text-black"
                          style={{ backgroundColor: region.color }}
                        >
                          {step.step}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-lg font-semibold text-white">
                            {step.title}
                          </p>
                          <p className="mt-2 text-sm leading-relaxed text-slate-400 sm:text-base">
                            {step.description}
                          </p>
                          <div className="mt-4 flex flex-wrap gap-2 text-xs sm:text-sm">
                            <span className="rounded-lg bg-slate-800 px-3 py-1 text-slate-300">
                              ⏱ {step.time}
                            </span>
                            <span
                              className={`rounded-lg bg-slate-800 px-3 py-1 font-medium ${difficultyStyles(step.difficulty)}`}
                            >
                              {step.difficulty}
                            </span>
                            {step.tools.map((tool) => (
                              <span
                                key={tool}
                                className="rounded-lg bg-slate-800 px-3 py-1 text-slate-400"
                              >
                                🔧 {tool}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Visual guides - large cards */}
              {inspection.visualGuides.length > 0 && (
                <section>
                  <h3 className="mb-4 flex items-center gap-2 text-xl font-semibold">
                    <Play className="h-6 w-6 text-red-400" />
                    Visual Guides
                  </h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {inspection.visualGuides.map((guide) => (
                      <a
                        key={guide.title}
                        href={`https://www.youtube.com/results?search_query=${encodeURIComponent(guide.youtubeQuery)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group rounded-2xl border border-red-500/30 bg-gradient-to-br from-red-500/10 to-[#111827] p-6 transition-all hover:border-red-400/60 hover:from-red-500/20"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/20">
                            <Play className="h-8 w-8 text-red-400" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-white group-hover:text-red-300">
                              {guide.title}
                            </p>
                            <p className="mt-1 flex items-center gap-1 text-sm text-slate-400">
                              Watch on YouTube
                              <ExternalLink className="h-3.5 w-3.5" />
                            </p>
                          </div>
                        </div>
                        <div className="mt-4 flex items-start gap-2 rounded-xl bg-slate-900/80 p-3 text-sm text-slate-400">
                          <Camera className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" />
                          <span>{guide.photoPrompt}</span>
                        </div>
                      </a>
                    ))}
                  </div>
                </section>
              )}

              {/* Parts to buy — affiliate-first table + one-click inventory */}
              {purchaseRecommendations.length > 0 && (
                <section>
                  <h3 className="mb-2 text-xl font-semibold">
                    Parts to Buy &amp; Track
                  </h3>
                  <p className="mb-4 text-sm text-slate-400">
                    OEM, brand, price, and store links — catalog matches preferred
                    when available. Add to inventory in one click.
                  </p>
                  <PartsRecommendationTable
                    parts={recommendationsToPartsData(purchaseRecommendations)}
                    vehicle={vehicle}
                    title={`${purchaseRecommendations.length} part${purchaseRecommendations.length === 1 ? "" : "s"} for this area`}
                  />
                </section>
              )}

              {/* Legacy simple table fallback */}
              {purchaseRecommendations.length === 0 &&
                inspection.partsTable.length > 0 && (
                <section>
                  <h3 className="mb-4 text-xl font-semibold">Parts & Prices</h3>
                  <div className="overflow-x-auto rounded-2xl border border-slate-700">
                    <table className="w-full min-w-[520px] text-left text-sm sm:text-base">
                      <thead className="bg-slate-900 text-slate-400">
                        <tr>
                          <th className="px-4 py-4 font-medium">Part</th>
                          <th className="px-4 py-4 font-medium">OEM</th>
                          <th className="px-4 py-4 font-medium">Aftermarket</th>
                          <th className="px-4 py-4 font-medium">Est. Price</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800 bg-[#111827]">
                        {inspection.partsTable.map((row) => (
                          <tr key={row.part}>
                            <td className="px-4 py-4 font-medium text-white">
                              {row.part}
                            </td>
                            <td className="px-4 py-4 text-slate-300">{row.oem}</td>
                            <td className="px-4 py-4 text-slate-300">
                              {row.aftermarket}
                            </td>
                            <td className="px-4 py-4 font-semibold text-cyan-400">
                              {row.price}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {/* Safety */}
              {inspection.safetyNotes.length > 0 && (
                <section className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6">
                  <h3 className="mb-3 flex items-center gap-2 font-semibold text-amber-300">
                    <Shield className="h-5 w-5" />
                    Safety Notes
                  </h3>
                  <ul className="space-y-2 text-sm text-slate-400 sm:text-base">
                    {inspection.safetyNotes.map((note) => (
                      <li key={note} className="border-l-2 border-amber-500/50 pl-4">
                        {note}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* Continue in chat */}
              <button
                type="button"
                onClick={() => onAskAI(chatPrompt)}
                className="flex w-full items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-500 py-5 text-lg font-semibold text-black transition-all hover:from-cyan-400 hover:to-blue-400"
              >
                <Zap className="h-6 w-6" />
                Continue Diagnosis in AI Chat
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
