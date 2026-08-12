"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Battery,
  BookOpen,
  Car,
  Disc3,
  FileText,
  Gauge,
  Snowflake,
  Sparkles,
  Thermometer,
  Wrench,
  Zap,
} from "lucide-react";
import type { VehicleInfo } from "@/lib/types/chat";
import {
  listCoachPlaybooks,
  listRecommendedCoachPlaybooks,
  getCoachPlaybook,
  type CoachPlaybookSlug,
} from "@/lib/coach-scenarios/catalog";
import { toCoachVehicleContext } from "@/lib/coach-scenarios/vehicle-context";
import CoachScenarioPlayer from "@/components/coach/CoachScenarioPlayer";
import DtcEntryBar from "@/components/chat/DtcEntryBar";
import InsuranceModTip from "@/components/legal/InsuranceModTip";
import {
  buildDtcDiagnosisPrompt,
  buildObdBleDiagnosisPrompt,
  extractDtcCodes,
  lookupDtc,
} from "@/lib/dtc";
import type { ObdVisionAnalysis } from "@/lib/types/dtc";
import type { ObdSessionSnapshot } from "@/lib/types/obd-session";
import { useSubscription } from "@/hooks/useSubscription";
import UpgradeButton from "@/components/ui/UpgradeButton";
import UpgradeModal, {
  type UpgradeReason,
} from "@/components/ui/UpgradeModal";
import {
  computeHealthScore,
  loadVehicleVitals,
} from "@/lib/vehicle-vitals";
import { maintenanceService } from "@/lib/maintenance-records";
import { exportAnnualHealthReportPdf } from "@/lib/export-annual-health-report";
import { useTranslation } from "react-i18next";
import { supabase } from "@/lib/supabase";
import type { PlaybookQuota } from "@/lib/playbook-limits";
import { safetyTierForPlaybook } from "@/lib/safety-tier";
import { vehicleHasModifiedTag } from "@/lib/insurance-tips";
import { useSafetyAdviceAck } from "@/hooks/useSafetyAdviceAck";
import SafetyTierTip from "@/components/legal/SafetyTierTip";
import SafetyAdviceAckModal from "@/components/legal/SafetyAdviceAckModal";
import { MOD_CONTEXT_PATTERN } from "@/lib/insurance-safety-copy";

type Props = {
  currentVehicle: VehicleInfo | null;
  onAskAI: (
    prompt: string,
    options?: { playbookSlug?: string; images?: string[] },
  ) => void;
  onGoToParts?: () => void;
  onMergeVehicleLocal?: (
    vehicleId: string,
    patch: Partial<VehicleInfo>,
  ) => void;
  /** Open a playbook immediately (e.g. from Home predictive “How to do it”) */
  initialPlaybookSlug?: string | null;
  onInitialPlaybookConsumed?: () => void;
};

const FOCUS_ICON: Record<string, typeof BookOpen> = {
  engine: Gauge,
  brakes: Disc3,
  tires: Car,
  battery: Battery,
  hvac: Thermometer,
  transmission: Wrench,
  suspension: Wrench,
  lights: Zap,
};

function phaseLabel(phase: 1 | 2 | 3) {
  if (phase === 1) return "Core";
  if (phase === 2) return "Extended";
  return "Phase 3";
}

export default function CoachLibrary({
  currentVehicle,
  onAskAI,
  onGoToParts,
  onMergeVehicleLocal,
  initialPlaybookSlug = null,
  onInitialPlaybookConsumed,
}: Props) {
  const { features, isFree, recordPhotoDiagnose } = useSubscription();
  const { t } = useTranslation();
  const [activeSlug, setActiveSlug] = useState<CoachPlaybookSlug | null>(null);
  const [pendingSlug, setPendingSlug] = useState<CoachPlaybookSlug | null>(
    null,
  );
  const [reportBusy, setReportBusy] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [upgradeReason, setUpgradeReason] =
    useState<UpgradeReason>("annual");
  const [quota, setQuota] = useState<PlaybookQuota | null>(null);
  const [starting, setStarting] = useState(false);
  const playbooks = useMemo(() => listCoachPlaybooks(), []);
  const recommended = useMemo(
    () => listRecommendedCoachPlaybooks(currentVehicle, { limit: 5 }),
    [currentVehicle],
  );
  const {
    showAckModal,
    requestHighTierAccess,
    acknowledge,
    cancelPending,
  } = useSafetyAdviceAck();
  const scenario = activeSlug ? getCoachPlaybook(activeSlug) : null;

  const vehicleCtx = toCoachVehicleContext(currentVehicle);

  useEffect(() => {
    void (async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.access_token) return;
        const res = await fetch("/api/coach/playbook-session", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!res.ok) return;
        const json = (await res.json()) as { quota?: PlaybookQuota };
        if (json.quota) setQuota(json.quota);
      } catch {
        /* ignore */
      }
    })();
  }, []);

  const openPlaybook = async (slug: CoachPlaybookSlug) => {
    if (starting) return;
    if (safetyTierForPlaybook(slug) === "high") {
      const ok = requestHighTierAccess();
      if (!ok) {
        setPendingSlug(slug);
        return;
      }
    }
    setStarting(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        alert("Please sign in to start a coach guide.");
        return;
      }
      const res = await fetch("/api/coach/playbook-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ playbookSlug: slug }),
      });
      const json = (await res.json()) as {
        quota?: PlaybookQuota;
        error?: string;
        code?: string;
      };
      if (json.quota) setQuota(json.quota);
      if (!res.ok) {
        if (json.code === "playbook_limit") {
          setUpgradeReason("playbook");
          setShowUpgrade(true);
          return;
        }
        alert(json.error || "Could not start playbook.");
        return;
      }
      setActiveSlug(slug);
    } finally {
      setStarting(false);
    }
  };

  useEffect(() => {
    if (!initialPlaybookSlug) return;
    const playbook = getCoachPlaybook(initialPlaybookSlug);
    if (!playbook) {
      onInitialPlaybookConsumed?.();
      return;
    }
    void openPlaybook(initialPlaybookSlug as CoachPlaybookSlug).finally(() => {
      onInitialPlaybookConsumed?.();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open once per slug
  }, [initialPlaybookSlug]);

  const handleAnnualReport = async () => {
    if (!currentVehicle) {
      alert("Select a vehicle first to generate an annual health report.");
      return;
    }
    if (!features.annualHealthReport) {
      setUpgradeReason("annual");
      setShowUpgrade(true);
      return;
    }

    setReportBusy(true);
    try {
      const vitals = loadVehicleVitals(currentVehicle.id);
      const health = computeHealthScore(currentVehicle, vitals);
      const { records } = await maintenanceService.list({
        vehicleId: currentVehicle.id,
        isPro: features.maintenanceHistory,
      });
      exportAnnualHealthReportPdf({
        vehicle: currentVehicle,
        vitals,
        health,
        maintenanceRecords: records,
        recommendedGuides: recommended,
      });
    } catch (err) {
      alert(
        err instanceof Error
          ? err.message
          : "Could not generate the annual health report.",
      );
    } finally {
      setReportBusy(false);
    }
  };

  const vehicleLabel = currentVehicle
    ? `${currentVehicle.year} ${currentVehicle.make} ${currentVehicle.model}`
    : null;

  const runDtcToChat = (code: string) => {
    const parsed = lookupDtc(code);
    onAskAI(
      buildDtcDiagnosisPrompt({
        codes: [parsed],
        source: "manual",
        vehicleLabel: vehicleLabel || undefined,
      }),
      { playbookSlug: activeSlug || "diagnosis_check_engine" },
    );
  };

  const runObdBleToChat = (snapshot: ObdSessionSnapshot) => {
    onAskAI(
      buildObdBleDiagnosisPrompt({
        deviceName: snapshot.deviceName,
        codes: snapshot.codes,
        vehicleLabel: vehicleLabel || undefined,
        sensors: snapshot.sensors,
        odometerKm: snapshot.odometerKm,
        distanceSinceCodesClearedKm: snapshot.distanceSinceCodesClearedKm,
      }),
      { playbookSlug: "diagnosis_check_engine" },
    );
  };

  const runObdScreenshotToChat = async (imageDataUrl: string) => {
    if (!currentVehicle) {
      alert(t("obd.selectVehicleFirst"));
      return;
    }
    // Same Free daily photo-diagnose soft-cap as Chat
    if (!features.canUsePhotoDiagnose || !recordPhotoDiagnose()) {
      setUpgradeReason("photo");
      setShowUpgrade(true);
      return;
    }
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) {
      alert(t("dtc.signInForObdPhoto"));
      return;
    }
    try {
      const res = await fetch("/api/vision/analyze-obd", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          image: imageDataUrl,
          vehicle: {
            year: currentVehicle.year,
            make: currentVehicle.make,
            model: currentVehicle.model,
            market: currentVehicle.market,
            engine: currentVehicle.engine,
          },
        }),
      });
      const json = (await res.json()) as {
        data?: ObdVisionAnalysis;
        codes?: ObdVisionAnalysis["codes"];
        error?: string;
      };
      if (!res.ok) {
        alert(json.error || "Could not read the OBD screenshot.");
        return;
      }
      const codesRaw = json.data?.codes ?? json.codes ?? [];
      const byCode = new Map<string, ReturnType<typeof lookupDtc>>();
      for (const c of codesRaw) byCode.set(c.code, lookupDtc(c.code));
      for (const c of extractDtcCodes(
        [json.data?.notes, json.data?.raw_text_glimpse].filter(Boolean).join(" "),
      )) {
        byCode.set(c, lookupDtc(c));
      }
      const merged = [...byCode.values()];
      if (merged.length) {
        onAskAI(
          buildDtcDiagnosisPrompt({
            codes: merged,
            source: "obd_screenshot",
            vehicleLabel: vehicleLabel || undefined,
          }),
          {
            playbookSlug: "diagnosis_check_engine",
            images: [imageDataUrl],
          },
        );
      } else {
        onAskAI(
          "I uploaded an OBD / warning-light photo from the Check Engine guide but no code was readable. Help me capture the code screen or diagnose from what you can see.",
          {
            playbookSlug: "diagnosis_check_engine",
            images: [imageDataUrl],
          },
        );
      }
    } catch {
      alert("Could not analyze the OBD screenshot. Try again.");
    }
  };

  if (scenario && activeSlug) {
    const showDtcEntry = activeSlug === "diagnosis_check_engine";
    const tier = safetyTierForPlaybook(activeSlug);
    const showModTip =
      activeSlug === "maintenance_modified_car" ||
      vehicleHasModifiedTag(currentVehicle) ||
      MOD_CONTEXT_PATTERN.test(scenario.title || "");
    return (
      <div className="flex h-full min-h-0 flex-col">
        <SafetyAdviceAckModal
          open={showAckModal}
          onContinue={() => {
            void acknowledge().then(() => {
              if (pendingSlug) {
                const slug = pendingSlug;
                setPendingSlug(null);
                void openPlaybook(slug);
              }
            });
          }}
          onCancel={() => {
            cancelPending();
            setPendingSlug(null);
          }}
        />
        {showDtcEntry ? (
          <DtcEntryBar
            variant="coach"
            onCodeSubmit={runDtcToChat}
            onObdImage={(img) => void runObdScreenshotToChat(img)}
            onObdBleSession={runObdBleToChat}
            vehicleId={currentVehicle?.id}
            onMileageSynced={(result) => {
              if (!currentVehicle) return;
              onMergeVehicleLocal?.(currentVehicle.id, {
                mileage: result.mileage,
                mileageUnit: result.unit,
              });
            }}
          />
        ) : null}
        <div className="border-b border-slate-800 bg-[#0a0f1c] px-3 py-2 sm:px-4">
          {showModTip ? (
            <div className="mb-2">
              <InsuranceModTip vehicle={currentVehicle} />
            </div>
          ) : null}
          <SafetyTierTip
            tier={tier}
            mods={showModTip}
            onExportShopReport={() =>
              onAskAI(
                "Help me prepare an educational Shop Report summary of what I observed in this coach guide for my technician. Verification only — not a final diagnosis.",
                { playbookSlug: activeSlug || undefined },
              )
            }
          />
        </div>
        <div className="min-h-0 flex-1">
          <CoachScenarioPlayer
            scenario={scenario}
            vehicle={vehicleCtx}
            onClose={() => setActiveSlug(null)}
            onOpenChat={(prompt) =>
              onAskAI(prompt, { playbookSlug: activeSlug || undefined })
            }
            onOpenParts={() => onGoToParts?.()}
            onOpenShop={() =>
              onAskAI(
                "Help me find a nearby trusted shop for this job on my vehicle. What should I ask them to check?",
                { playbookSlug: activeSlug || undefined },
              )
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto bg-[#0a0f1c] pb-[var(--content-pad-bottom)] lg:pb-0">
      <SafetyAdviceAckModal
        open={showAckModal}
        onContinue={() => {
          void acknowledge().then(() => {
            if (pendingSlug) {
              const slug = pendingSlug;
              setPendingSlug(null);
              void openPlaybook(slug);
            }
          });
        }}
        onCancel={() => {
          cancelPending();
          setPendingSlug(null);
        }}
      />
      <div className="mx-auto w-full max-w-3xl px-4 py-6">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-500/20">
              <BookOpen className="h-5 w-5 text-cyan-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">
                {t("coach.title")}
              </h1>
              <p className="mt-1 text-sm text-slate-400">
                {t("coach.subtitle", {
                  count: playbooks.length,
                  vehicle: vehicleLabel
                    ? t("coach.yourVehicle", { vehicle: vehicleLabel })
                    : t("coach.yourGarage"),
                })}
              </p>
              {isFree && quota && !quota.unlimited && (
                <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900/80 px-2.5 py-1 text-xs text-slate-300">
                  <span
                    className={
                      (quota.remaining ?? 0) <= 0
                        ? "font-semibold text-amber-300"
                        : "font-semibold text-cyan-300"
                    }
                  >
                    {quota.remaining ?? 0}/{quota.limit ?? 5} playbooks left
                  </span>
                  <span className="text-slate-500">·</span>
                  <span className="text-slate-500">
                    {quota.resetsAt
                      ? `resets ${new Date(quota.resetsAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}`
                      : "every 30 days"}
                  </span>
                </p>
              )}
              {!isFree && (
                <p className="mt-2 text-xs text-emerald-400/90">
                  Unlimited coach playbooks on your plan
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => void handleAnnualReport()}
            disabled={reportBusy}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-3 text-sm font-medium text-cyan-200 hover:border-cyan-400/60 hover:bg-cyan-500/15 disabled:opacity-60"
          >
            <FileText className="h-4 w-4" />
            {reportBusy
              ? "Building…"
              : features.annualHealthReport
                ? "Annual Health Report"
                : "Annual Report (Pro)"}
          </button>
        </div>

        {/* Recommended for this vehicle */}
        <section className="mb-8">
          <div className="mb-3 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-cyan-400" />
            <h2 className="text-sm font-semibold uppercase tracking-wide text-cyan-300">
              {t("coach.recommended")}
            </h2>
          </div>
          <p className="mb-3 text-xs text-slate-500">
            {vehicleLabel
              ? t("coach.recommendedFor", { vehicle: vehicleLabel })
              : t("coach.recommendedEmpty")}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {recommended.map((pb, i) => {
              const Icon = FOCUS_ICON[pb.focus_part || "engine"] || BookOpen;
              return (
                <button
                  key={pb.slug}
                  type="button"
                  onClick={() => void openPlaybook(pb.slug)}
                  disabled={starting}
                  className="rounded-2xl border border-cyan-500/25 bg-gradient-to-br from-cyan-500/10 to-slate-900/60 p-4 text-left transition hover:border-cyan-400/50 hover:from-cyan-500/15 disabled:opacity-60"
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-500/20">
                      <Icon className="h-4 w-4 text-cyan-300" />
                    </div>
                    <span className="rounded-full bg-cyan-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cyan-200">
                      #{i + 1}
                    </span>
                  </div>
                  <h3 className="text-base font-semibold text-white">
                    {pb.title}
                  </h3>
                  <p className="mt-1 text-xs font-medium text-cyan-300/90">
                    {pb.reason}
                  </p>
                  <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-slate-400">
                    {pb.subtitle}
                  </p>
                  <p className="mt-3 text-[11px] text-slate-500">
                    {pb.estimated_minutes}
                  </p>
                </button>
              );
            })}
          </div>
        </section>

        {/* Pro value teaser when free */}
        {isFree && (
          <div className="mb-8 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-700 bg-slate-900/50 px-4 py-3">
            <p className="text-xs text-slate-400">
              Free includes {quota?.limit ?? 5} playbook starts every 30 days
              from signup
              {quota && !quota.unlimited
                ? ` · ${quota.remaining ?? 0} remaining this period`
                : ""}
              . Upgrade for unlimited guides, custom tags, and annual health
              report — cancel anytime.
            </p>
            <UpgradeButton size="sm" label="Upgrade to Pro" />
          </div>
        )}

        <div className="mb-4 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-slate-800 px-3 py-1 text-slate-300">
            Phase 1 · Core
          </span>
          <span className="rounded-full bg-slate-800 px-3 py-1 text-slate-300">
            Phase 2 · Extended
          </span>
          <span className="rounded-full bg-slate-800 px-3 py-1 text-slate-300">
            Phase 3 · Specialty
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-cyan-500/10 px-3 py-1 text-cyan-300">
            <Zap className="h-3 w-3" />
            Feedback on every step
          </span>
        </div>

        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
          {t("coach.allGuides")}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {playbooks.map((pb) => {
            const Icon = FOCUS_ICON[pb.focus_part || "engine"] || BookOpen;
            const isRec = recommended.some((r) => r.slug === pb.slug);
            return (
              <button
                key={pb.slug}
                type="button"
                onClick={() => void openPlaybook(pb.slug)}
                disabled={starting}
                className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 text-left transition hover:border-cyan-500/40 hover:bg-slate-900/80 disabled:opacity-60"
              >
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-800">
                    <Icon className="h-4 w-4 text-cyan-400" />
                  </div>
                  <div className="flex items-center gap-1.5">
                    {isRec && (
                      <span className="rounded-full bg-cyan-500/15 px-2 py-0.5 text-[10px] font-medium text-cyan-300">
                        For you
                      </span>
                    )}
                    <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-400">
                      {phaseLabel(pb.phase)}
                    </span>
                  </div>
                </div>
                <h2 className="text-base font-semibold text-white">{pb.title}</h2>
                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-400">
                  {pb.subtitle}
                </p>
                <p className="mt-3 text-[11px] text-slate-500">
                  {pb.estimated_minutes}
                  {pb.focus_part ? ` · ${pb.focus_part}` : ""}
                </p>
              </button>
            );
          })}
        </div>

        <p className="mt-8 flex items-start gap-2 text-[11px] leading-relaxed text-slate-500">
          <Snowflake className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          High-risk steps require a risk confirmation. Cancel always offers Find
          a nearby shop. After each step, tap Yes/No so we can keep improving
          the guides.
        </p>
      </div>

      <UpgradeModal
        open={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        reason={upgradeReason}
      />
    </div>
  );
}
