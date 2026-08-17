"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Bell,
  Bluetooth,
  Camera,
  CheckCircle,
  Clock,
  FileDown,
  Plus,
  Search,
  Thermometer,
  TrendingUp,
} from "lucide-react";
import { DASHBOARD_REGIONS } from "@/lib/dashboard-regions";
import {
  loadInspectionCache,
  loadLatestRegionCache,
  saveInspectionCache,
} from "@/lib/inspection-cache";
import type { DashboardRegion, RegionInspection } from "@/lib/types/dashboard";
import type { VehicleInfo } from "@/lib/types/chat";
import type { FocusCommand } from "@/lib/types/focus";
import {
  formatVehicleYmmMarket,
  normalizeVehicleMarket,
  VEHICLE_MARKETS,
  type VehicleMarketCode,
} from "@/lib/types/vehicle-market";
import { getDashboardRegion } from "@/lib/dashboard-regions";
import { inferVehicleBodyClass } from "@/lib/vehicle-body-class";
import RegionDetailPanel from "./RegionDetailPanel";
import FocusPanel from "./FocusPanel";
import VehicleSystemsDiagram from "./VehicleSystemsDiagram";
import UpgradeButton from "@/components/ui/UpgradeButton";
import { useSubscription } from "@/hooks/useSubscription";
import { focusPartToRegionId } from "@/lib/types/focus";
import AddVehicleModal from "@/components/vehicles/AddVehicleModal";
import CameraCapture from "@/components/chat/CameraCapture";
import ObdConnectModal from "@/components/obd/ObdConnectModal";
import { useTranslation } from "react-i18next";
import { hideStorePurchaseUi } from "@/lib/native-platform";
import { useObdPreference } from "@/hooks/useObdPreference";
import {
  refreshSensorsAction,
  shouldShowObdConnectEntry,
} from "@/lib/obd-preference";
import {
  buildObdBleDiagnosisPrompt,
} from "@/lib/dtc";
import type { ObdSessionSnapshot } from "@/lib/types/obd-session";
import {
  buildCodesAskPrompt,
  computeHealthScore,
  estimateMarketBand,
  estimateMilesToService,
  fluidTone,
  healthTrendLabel,
  levelFromValue,
  loadVehicleVitals,
  saveVehicleVitals,
  severityTone,
  type DiagnosticCode,
  type FluidStatus,
  type VehicleVitals,
} from "@/lib/vehicle-vitals";
import {
  applyVisionToVitals,
  vehicleVitalsCloud,
  type VehicleVitalsRow,
  type VisionVehicleAnalysis,
} from "@/lib/supabase-vehicle-vitals";
import { supabase } from "@/lib/supabase";
import {
  getObdConnector,
  LIVE_SENSOR_PIDS,
  formatLiveSensorValue,
  hasLiveSensorData,
  type ObdLiveSensors,
} from "@/lib/obd";
import {
  getAffiliateLinks,
  partQueryForDtc,
} from "@/lib/affiliate-links";
import { enableWebPushReminders, isWebPushSupported, syncWebPushIfGranted } from "@/lib/push-client";
import {
  listReminderInbox,
  markAllRemindersRead,
  markReminderRead,
  type ReminderInboxItem,
} from "@/lib/reminder-inbox";
import { exportVehicleReportPdf } from "@/lib/export-vehicle-report";
import { exportAnnualHealthReportPdf } from "@/lib/export-annual-health-report";
import { listRecommendedCoachPlaybooks } from "@/lib/coach-scenarios/catalog";
import { maintenanceService } from "@/lib/maintenance-records";
import UpgradeModal from "@/components/ui/UpgradeModal";
import HomeHub from "@/components/home/HomeHub";

interface Props {
  onAskAI?: (
    prompt: string,
    options?: { images?: string[]; playbookSlug?: string },
  ) => void;
  /** Focus Mode payload from Chat (AI <focus> / focus-data) */
  focusCommand?: FocusCommand | null;
  onFocusConsumed?: () => void;
  vehicles: VehicleInfo[];
  currentVehicle: VehicleInfo | null;
  vehiclesLoading?: boolean;
  onVehicleChange: (vehicle: VehicleInfo) => void | Promise<void>;
  onAddVehicle?: (vehicle: VehicleInfo) => void | Promise<VehicleInfo>;
  onUpdateVehicle?: (vehicle: VehicleInfo) => void | Promise<VehicleInfo>;
  onMergeVehicleLocal?: (
    vehicleId: string,
    patch: Partial<VehicleInfo>,
  ) => void;
  onOpenSettings?: () => void;
  onOpenCoach?: (slug?: string) => void;
  onOpenChat?: () => void;
  onOpenHistory?: () => void;
}

export default function Dashboard({
  onAskAI,
  focusCommand = null,
  onFocusConsumed,
  vehicles,
  currentVehicle,
  vehiclesLoading = false,
  onVehicleChange,
  onAddVehicle,
  onUpdateVehicle,
  onMergeVehicleLocal,
  onOpenSettings,
  onOpenCoach,
  onOpenChat,
  onOpenHistory,
}: Props) {
  const { t } = useTranslation();
  const { isFree, features } = useSubscription();
  const { pref: obdPref } = useObdPreference();
  const showObdConnectEntry = shouldShowObdConnectEntry(obdPref);
  const vehicle = currentVehicle;
  const [marketFilter, setMarketFilter] = useState<"ALL" | VehicleMarketCode>(
    "ALL",
  );
  const [editingVehicle, setEditingVehicle] = useState<VehicleInfo | null>(
    null,
  );
  const [showAddVehicle, setShowAddVehicle] = useState(false);
  const [selectedRegion, setSelectedRegion] = useState<DashboardRegion | null>(
    null,
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [symptoms, setSymptoms] = useState("");
  const [inspection, setInspection] = useState<RegionInspection | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [activeFocus, setActiveFocus] = useState<FocusCommand | null>(null);
  const [vitals, setVitals] = useState<VehicleVitals | null>(null);
  const [showObdModal, setShowObdModal] = useState(false);
  const [obdNote, setObdNote] = useState<string | null>(null);
  const [liveSensors, setLiveSensors] = useState<ObdLiveSensors | null>(null);
  const [isRefreshingSensors, setIsRefreshingSensors] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [inbox, setInbox] = useState<ReminderInboxItem[]>([]);
  const [inboxLoading, setInboxLoading] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [isAnalyzingPhoto, setIsAnalyzingPhoto] = useState(false);
  const [visionNote, setVisionNote] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState("");
  const [annualBusy, setAnnualBusy] = useState(false);
  const [showAnnualUpgrade, setShowAnnualUpgrade] = useState(false);
  const [manualDesc, setManualDesc] = useState("");
  const [vitalsHistory, setVitalsHistory] = useState<VehicleVitalsRow[]>([]);
  const pendingManualVitalsRef = useRef<VehicleVitals | null>(null);
  const vitalsCloudSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const loadVitalsHistory = useCallback(async (vehicleId: string) => {
    const rows = await vehicleVitalsCloud.listRecent(vehicleId, 5);
    setVitalsHistory(rows);
  }, []);

  const loadInbox = useCallback(async (vehicleId?: string | null) => {
    setInboxLoading(true);
    try {
      const rows = await listReminderInbox(vehicleId, 12);
      setInbox(rows);
    } finally {
      setInboxLoading(false);
    }
  }, []);

  // Quiet push re-sync when permission already granted
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled || !session?.access_token) return;
      await syncWebPushIfGranted(session.access_token);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Hydrate when active garage vehicle changes
  useEffect(() => {
    if (!vehicle?.id) {
      setVitals(null);
      setVitalsHistory([]);
      setLiveSensors(null);
      setInbox([]);
      return;
    }
    let cancelled = false;
    setVisionNote(null);
    setObdNote(null);
    setLiveSensors(null);
    void (async () => {
      try {
        const hydrated = await vehicleVitalsCloud.hydrateLocal(vehicle.id);
        if (!cancelled) setVitals(hydrated);
      } catch {
        if (!cancelled) setVitals(loadVehicleVitals(vehicle.id));
      }
      if (!cancelled) {
        await loadVitalsHistory(vehicle.id);
        await loadInbox(vehicle.id);
      }
    })();
    return () => {
      cancelled = true;
      if (vitalsCloudSyncTimerRef.current) {
        clearTimeout(vitalsCloudSyncTimerRef.current);
        vitalsCloudSyncTimerRef.current = null;
      }
    };
  }, [vehicle?.id, loadVitalsHistory, loadInbox]);

  const loadLatestVitals = useCallback(async (vehicleId: string) => {
    try {
      const hydrated = await vehicleVitalsCloud.hydrateLocal(vehicleId);
      setVitals(hydrated);
      await loadVitalsHistory(vehicleId);
      return hydrated;
    } catch {
      const local = loadVehicleVitals(vehicleId);
      setVitals(local);
      return local;
    }
  }, [loadVitalsHistory]);

  const restoreSnapshot = useCallback(
    (row: VehicleVitalsRow) => {
      if (!vehicle) return;
      const historyScores = [...vitalsHistory]
        .filter((r) => typeof r.health_score === "number")
        .map((r) => ({
          at: r.snapshot_at,
          score: r.health_score as number,
        }))
        .reverse();
      const restored = vehicleVitalsCloud.snapshotToLocal(
        vehicle.id,
        row,
        historyScores,
      );
      setVitals(restored);
      saveVehicleVitals(restored);
      setVisionNote(
        `Restored snapshot from ${new Date(row.snapshot_at).toLocaleString()} (${row.source})`,
      );
    },
    [vehicle, vitalsHistory],
  );

  /** Chart points: oldest → newest, padded SVG coords */
  const healthChart = useMemo(() => {
    const series = [...vitalsHistory]
      .filter((r) => typeof r.health_score === "number")
      .reverse();
    if (!series.length) return { points: "", dots: [] as { x: number; y: number; score: number }[] };

    const w = 400;
    const h = 160;
    const padX = 24;
    const padY = 16;
    const n = series.length;
    const dots = series.map((r, i) => {
      const score = r.health_score as number;
      const x =
        n === 1 ? w / 2 : padX + (i * (w - padX * 2)) / Math.max(n - 1, 1);
      const y = padY + ((100 - score) / 100) * (h - padY * 2);
      return { x, y, score };
    });
    const points = dots.map((d) => `${d.x},${d.y}`).join(" ");
    return { points, dots };
  }, [vitalsHistory]);

  const persistVitals = useCallback(
    (next: VehicleVitals, options?: { recordHealth?: boolean }) => {
      const score = vehicle ? computeHealthScore(vehicle, next) : 0;
      const stamped: VehicleVitals = {
        ...next,
        healthHistory: options?.recordHealth
          ? [
              ...next.healthHistory.slice(-29),
              { at: new Date().toISOString(), score },
            ]
          : next.healthHistory,
        updatedAt: new Date().toISOString(),
      };
      setVitals(stamped);
      saveVehicleVitals(stamped);
      if (!vehicle) return;
      pendingManualVitalsRef.current = stamped;
      if (vitalsCloudSyncTimerRef.current) {
        clearTimeout(vitalsCloudSyncTimerRef.current);
      }
      const vehicleId = vehicle.id;
      const snapshotVehicle = vehicle;
      vitalsCloudSyncTimerRef.current = setTimeout(() => {
        const latest = pendingManualVitalsRef.current;
        if (!latest) return;
        void vehicleVitalsCloud
          .insertSnapshot({
            vehicle: snapshotVehicle,
            fluids: latest.fluids,
            codes: latest.codes,
            healthScore: computeHealthScore(snapshotVehicle, latest),
            source: "manual",
          })
          .then(() => {
            void loadVitalsHistory(vehicleId);
          });
      }, 1600);
    },
    [vehicle, loadVitalsHistory],
  );

  const health = useMemo(() => {
    if (!vehicle || !vitals) return null;
    // Prefer latest snapshot score (Vision / OBD) when present
    const last = vitals.healthHistory[vitals.healthHistory.length - 1];
    if (last && Date.now() - Date.parse(last.at) < 24 * 60 * 60 * 1000) {
      return last.score;
    }
    return computeHealthScore(vehicle, vitals);
  }, [vehicle, vitals]);

  const serviceEta = useMemo(
    () => (vehicle ? estimateMilesToService(vehicle) : null),
    [vehicle],
  );

  const marketBand = useMemo(
    () => (vehicle ? estimateMarketBand(vehicle) : "—"),
    [vehicle],
  );

  const handleEnablePush = async () => {
    setPushBusy(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        alert("Please sign in to enable push reminders.");
        return;
      }
      const result = await enableWebPushReminders(session.access_token);
      alert(result.message);
      if (result.ok && vehicle?.id) await loadInbox(vehicle.id);
    } catch (err) {
      alert(
        err instanceof Error
          ? err.message
          : "Could not enable push reminders.",
      );
    } finally {
      setPushBusy(false);
    }
  };

  const handleExportReport = () => {
    if (!vehicle) {
      alert("Please select a vehicle first.");
      return;
    }
    exportVehicleReportPdf({
      vehicle,
      vitals,
      health,
      liveSensors,
    });
  };

  const handleAnnualHealthReport = async () => {
    if (!vehicle) {
      alert("Please select a vehicle first.");
      return;
    }
    if (!features.annualHealthReport) {
      setShowAnnualUpgrade(true);
      return;
    }
    setAnnualBusy(true);
    try {
      const { records } = await maintenanceService.list({
        vehicleId: vehicle.id,
        isPro: features.maintenanceHistory,
      });
      exportAnnualHealthReportPdf({
        vehicle,
        vitals,
        health,
        liveSensors,
        maintenanceRecords: records,
        recommendedGuides: listRecommendedCoachPlaybooks(vehicle, { limit: 5 }),
      });
    } catch (err) {
      alert(
        err instanceof Error
          ? err.message
          : "Could not generate the annual health report.",
      );
    } finally {
      setAnnualBusy(false);
    }
  };

  const handleRefreshSensors = async () => {
    const obd = getObdConnector();
    const action = refreshSensorsAction({
      hasObdAdapter: showObdConnectEntry,
      isConnected: obd.isConnected,
    });
    if (action === "open_settings") {
      onOpenSettings?.();
      return;
    }
    if (action === "open_connect") {
      setShowObdModal(true);
      return;
    }
    setIsRefreshingSensors(true);
    try {
      const sensors = await obd.readLiveSensors();
      setLiveSensors(sensors);
    } catch (err) {
      alert(
        err instanceof Error
          ? err.message
          : t("obd.errorGeneric"),
      );
    } finally {
      setIsRefreshingSensors(false);
    }
  };

  const alertCount = vitals
    ? vitals.codes.filter(
        (c) => c.severity === "High" || c.severity === "Moderate",
      ).length +
      vitals.fluids.filter(
        (f) => f.level === "low" || f.level === "critical",
      ).length
    : 0;

  /** Persist a real BLE session into Dashboard vitals (never demo / fake codes). */
  const applyLiveObdSession = useCallback(
    (snapshot: ObdSessionSnapshot) => {
      if (!vehicle) return;
      const current = vitals ?? loadVehicleVitals(vehicle.id);
      const scanned: DiagnosticCode[] = snapshot.codes.map((c) => ({
        code: c.code,
        desc: c.desc,
        severity: c.severity,
        source: "obd" as const,
        recordedAt: snapshot.at || new Date().toISOString(),
      }));

      const nextFluids = current.fluids;
      const nextCodes = [...scanned, ...current.codes]
        .filter(
          (c, i, arr) => arr.findIndex((x) => x.code === c.code) === i,
        )
        .slice(0, 8);

      const healthScore =
        scanned.length > 0
          ? Math.min(88, computeHealthScore(vehicle, {
              ...current,
              codes: nextCodes,
              fluids: nextFluids,
            }))
          : computeHealthScore(vehicle, {
              ...current,
              codes: nextCodes,
              fluids: nextFluids,
            });

      const withScore: VehicleVitals = {
        ...current,
        fluids: nextFluids,
        codes: nextCodes,
        lastObdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        healthHistory: [
          ...current.healthHistory.slice(-29),
          { at: new Date().toISOString(), score: healthScore },
        ],
      };

      setVitals(withScore);
      saveVehicleVitals(withScore);
      setLiveSensors(snapshot.sensors);
      setObdNote(snapshot.note);

      void vehicleVitalsCloud
        .insertSnapshot({
          vehicle,
          fluids: nextFluids,
          codes: nextCodes,
          healthScore,
          notes: snapshot.note,
          source: "obd",
        })
        .then(() => {
          void loadVitalsHistory(vehicle.id);
        });
    },
    [vehicle, vitals, loadVitalsHistory],
  );

  const openObdConnect = () => {
    if (!vehicle) {
      alert(t("obd.selectVehicleFirst"));
      return;
    }
    const base = vitals ?? loadVehicleVitals(vehicle.id);
    if (!vitals) setVitals(base);
    setObdNote(null);
    setShowObdModal(true);
  };

  const handleObdAskAi = (snapshot: ObdSessionSnapshot) => {
    if (!vehicle) return;
    const vehicleLabel = `${vehicle.year} ${vehicle.make} ${vehicle.model}`;
    onAskAI?.(
      buildObdBleDiagnosisPrompt({
        deviceName: snapshot.deviceName,
        codes: snapshot.codes,
        vehicleLabel,
        sensors: snapshot.sensors,
        odometerKm: snapshot.odometerKm,
        distanceSinceCodesClearedKm: snapshot.distanceSinceCodesClearedKm,
      }),
    );
  };

  /** Open in-app camera for Vision → Dashboard writeback */
  const handlePhotoDiagnosis = () => {
    if (!vehicle) {
      alert("Please select a vehicle first.");
      return;
    }
    if (!vitals) {
      setVitals(loadVehicleVitals(vehicle.id));
    }
    setShowCamera(true);
  };

  /**
   * After CameraCapture: Vision API → persist vehicle_vitals → update UI.
   * Keeps Bearer auth (required for /api/vision/analyze-vehicle).
   */
  const handlePhotoCapture = async (imageBase64: string) => {
    if (!vehicle) return;
    const base = vitals ?? loadVehicleVitals(vehicle.id);
    setShowCamera(false);
    setIsAnalyzingPhoto(true);
    setVisionNote(null);
    setObdNote(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) {
        throw new Error("Please sign in to analyze photos.");
      }

      const response = await fetch("/api/vision/analyze-vehicle", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          image: imageBase64,
          imageBase64,
          vehicle: {
            year: vehicle.year,
            make: vehicle.make,
            model: vehicle.model,
            market: vehicle.market,
            engine: vehicle.engine,
          },
        }),
      });

      const payload = (await response.json()) as VisionVehicleAnalysis & {
        success?: boolean;
        data?: VisionVehicleAnalysis;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || "Vision analysis failed");
      }

      const visionData: VisionVehicleAnalysis = payload.data ?? payload;
      const next = applyVisionToVitals(base, visionData, vehicle);
      const score =
        typeof visionData.health_score === "number"
          ? visionData.health_score
          : computeHealthScore(vehicle, next);

      const withScore: VehicleVitals = {
        ...next,
        healthHistory:
          typeof visionData.health_score === "number"
            ? next.healthHistory
            : [
                ...next.healthHistory.slice(-29),
                { at: new Date().toISOString(), score },
              ],
      };

      setVitals(withScore);
      saveVehicleVitals(withScore);

      await vehicleVitalsCloud.insertSnapshot({
        vehicle,
        fluids: withScore.fluids,
        codes: withScore.codes,
        healthScore: score,
        notes: visionData.notes,
        source: "photo",
      });

      await loadVitalsHistory(vehicle.id);

      const summary =
        visionData.notes?.trim() ||
        "Photo analyzed — fluids / codes updated on this Dashboard.";
      setVisionNote(summary);
      alert(`✅ Dashboard updated!\n${summary}`);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "Could not analyze photo. Try again with better lighting.";
      setVisionNote(msg);
      alert(`❌ ${msg}`);
    } finally {
      setIsAnalyzingPhoto(false);
    }
  };

  const handleFluidEdit = (key: FluidStatus["key"], value: string) => {
    if (!vitals) return;
    persistVitals({
      ...vitals,
      fluids: vitals.fluids.map((f) =>
        f.key === key
          ? { ...f, value, level: levelFromValue(value) }
          : f,
      ),
    });
  };

  const handleAddManualCode = () => {
    if (!vitals || !manualCode.trim()) return;
    const code = manualCode.trim().toUpperCase();
    const entry: DiagnosticCode = {
      code,
      desc: manualDesc.trim() || "Manually logged code",
      severity: /^P0|^C0|^B0|^U0/.test(code) ? "Moderate" : "Info",
      source: "manual",
      recordedAt: new Date().toISOString(),
    };
    persistVitals(
      {
        ...vitals,
        codes: [entry, ...vitals.codes].slice(0, 8),
      },
      { recordHealth: true },
    );
    setManualCode("");
    setManualDesc("");
  };

  const handleAskAboutCodes = () => {
    if (!vehicle || !vitals?.codes.length) return;
    onAskAI?.(buildCodesAskPrompt(vehicle, vitals.codes));
  };

  // Chat → Dashboard Focus Mode
  useEffect(() => {
    if (!focusCommand) return;
    const region = getDashboardRegion(focusCommand.part);
    if (!region) return;
    setSelectedRegion(null);
    setInspection(null);
    setActiveFocus(focusCommand);
  }, [focusCommand]);

  const focusRegion = activeFocus
    ? getDashboardRegion(activeFocus.part) ?? null
    : null;

  const clearFocus = () => {
    setActiveFocus(null);
    onFocusConsumed?.();
  };

  const normalizedSearch = searchTerm.trim().toLowerCase();

  const filteredRegions = DASHBOARD_REGIONS.filter((region) =>
    region.name.toLowerCase().includes(normalizedSearch),
  );

  const fetchInspection = useCallback(
    async (
      region: DashboardRegion,
      currentVehicle: VehicleInfo,
      userSymptoms: string,
      options: { forceRefresh?: boolean; allowGeneral?: boolean } = {},
    ) => {
      const { forceRefresh = false, allowGeneral = false } = options;
      const trimmed = userSymptoms.trim();

      if (!allowGeneral && !forceRefresh) {
        const cached = loadInspectionCache(
          currentVehicle.id,
          region.id,
          trimmed,
        );
        if (cached) {
          setInspection(cached.inspection);
          setFromCache(true);
          setError(null);
          return;
        }
      }

      setLoading(true);
      setError(null);
      if (forceRefresh) {
        setInspection(null);
        setFromCache(false);
      }

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const accessToken = session?.access_token;
        if (!accessToken) {
          throw new Error("Please sign in to run AI inspection.");
        }

        const response = await fetch("/api/dashboard/inspect", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            regionId: region.id,
            symptoms: trimmed,
            allowGeneral,
            currentVehicle: currentVehicle,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error ?? "Inspection failed");
        }

        setInspection(data.inspection);
        setFromCache(false);
        saveInspectionCache(
          currentVehicle.id,
          region.id,
          allowGeneral ? "" : trimmed,
          data.inspection,
        );
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "AI inspection is temporarily unavailable.",
        );
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const handleRegionClick = (region: DashboardRegion) => {
    if (!vehicle) return;

    setSelectedRegion(region);
    setSymptoms("");
    setError(null);
    setLoading(false);

    const cached = loadLatestRegionCache(vehicle.id, region.id);
    if (cached) {
      setSymptoms(cached.symptoms);
      setInspection(cached.inspection);
      setFromCache(true);
    } else {
      setInspection(null);
      setFromCache(false);
    }
  };

  const handleRequestAI = () => {
    if (!selectedRegion || !vehicle) return;
    if (symptoms.trim().length < 3) {
      setError(
        "Describe your symptoms (at least 3 characters) — or use Chat for a quick free conversation.",
      );
      return;
    }
    void fetchInspection(selectedRegion, vehicle, symptoms);
  };

  const handleGeneralOverview = () => {
    if (!selectedRegion || !vehicle) return;
    void fetchInspection(selectedRegion, vehicle, "", { allowGeneral: true });
  };

  const handleRefreshAI = () => {
    if (!selectedRegion || !vehicle) return;
    void fetchInspection(selectedRegion, vehicle, symptoms, {
      forceRefresh: true,
      allowGeneral: !symptoms.trim(),
    });
  };

  const handleClose = () => {
    setSelectedRegion(null);
    setSymptoms("");
    setInspection(null);
    setError(null);
    setFromCache(false);
    setLoading(false);
  };

  const handleAskAI = (prompt: string) => {
    handleClose();
    onAskAI?.(prompt);
  };

  const isRegionVisible = (region: DashboardRegion) => {
    if (!normalizedSearch) return true;
    return filteredRegions.some((r) => r.id === region.id);
  };

  const isRegionHighlighted = (region: DashboardRegion) => {
    if (
      activeFocus &&
      focusPartToRegionId(activeFocus.part) === region.id
    ) {
      return true;
    }
    if (!normalizedSearch) return false;
    return filteredRegions.some((r) => r.id === region.id);
  };

  const vehicleLabel = vehicle
    ? formatVehicleYmmMarket(vehicle)
    : vehiclesLoading
      ? "Loading garage…"
      : "No vehicle yet";

  const marketsInGarage = VEHICLE_MARKETS.filter((m) =>
    vehicles.some((v) => normalizeVehicleMarket(v.market) === m.code),
  );

  const canAdd =
    Boolean(onAddVehicle) && features.canAddVehicle(vehicles.length);

  const handleAddVehicle = async (next: VehicleInfo) => {
    if (!onAddVehicle) return;
    if (!features.canAddVehicle(vehicles.length)) {
      alert(
        t(
          hideStorePurchaseUi()
            ? "vehicles.planLimitStore"
            : "vehicles.planLimit",
          { count: features.maxVehicles },
        ),
      );
      return;
    }
    await onAddVehicle(next);
  };

  return (
    <div className="panel-scroll relative min-h-0 flex-1 overflow-y-auto overscroll-y-contain bg-[#0a0f1c] p-3 pb-[var(--content-pad-bottom)] sm:p-6 lg:p-8 lg:pb-8">
      <div className="mx-auto max-w-7xl">
        <HomeHub
          vehicles={vehicles}
          vehicle={vehicle}
          vehiclesLoading={vehiclesLoading}
          vitals={vitals}
          onVehicleChange={onVehicleChange}
          onAskAI={onAskAI}
          onOpenSettings={() => onOpenSettings?.()}
          onOpenCoach={(slug) => onOpenCoach?.(slug)}
          onOpenChat={() => onOpenChat?.()}
          onOpenHistory={() => onOpenHistory?.()}
          onPhotoDiagnose={handlePhotoDiagnosis}
          onConnectObd={() => setShowObdModal(true)}
        />

        <div className="mb-6 mt-8 flex flex-col gap-3 border-t border-slate-800 pt-8 sm:mb-10 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
          <div>
            <h1 className="text-xl font-bold sm:text-2xl lg:text-3xl">
              Inspect
            </h1>
            <p className="mt-1 text-sm text-slate-400 sm:text-base">
              {vehicleLabel} • Tap an area — instant checklist, AI only when you
              need it
            </p>
            {vehicles.length >= 1 && (
              <div className="mt-3 max-w-md space-y-3">
                {marketsInGarage.length > 1 && (
                  <label className="block text-sm text-slate-400">
                    Filter by market
                    <select
                      className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-base text-slate-100 outline-none focus:border-cyan-400"
                      value={marketFilter}
                      onChange={(e) =>
                        setMarketFilter(
                          e.target.value as "ALL" | VehicleMarketCode,
                        )
                      }
                    >
                      <option value="ALL">All markets</option>
                      {marketsInGarage.map((m) => (
                        <option key={m.code} value={m.code}>
                          {m.code} · {m.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {onUpdateVehicle && vehicle && (
                  <button
                    type="button"
                    onClick={() => setEditingVehicle(vehicle)}
                    className="text-sm text-cyan-400 hover:text-cyan-300"
                  >
                    Edit vehicle (market &amp; config)
                  </button>
                )}
              </div>
            )}
            {!vehiclesLoading && vehicles.length === 0 && (
              <div className="mt-4 max-w-md rounded-2xl border border-cyan-500/30 bg-cyan-500/5 p-4">
                <p className="text-sm text-slate-300">
                  Add your first vehicle to unlock inspections, DIY chat, and
                  fitment-accurate parts.
                </p>
                {canAdd && (
                  <button
                    type="button"
                    data-testid="add-vehicle-open"
                    onClick={() => setShowAddVehicle(true)}
                    className="mt-3 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-cyan-500 px-4 text-sm font-medium text-slate-950"
                  >
                    <Plus className="h-4 w-4" />
                    Add vehicle
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {vehicle && (
              <>
                <button
                  type="button"
                  onClick={handleExportReport}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-700 px-3 text-sm text-slate-200 hover:border-cyan-500/50"
                >
                  <FileDown className="h-4 w-4" />
                  Export Snapshot
                </button>
                <button
                  type="button"
                  onClick={() => void handleAnnualHealthReport()}
                  disabled={annualBusy}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-3 text-sm font-medium text-cyan-200 hover:border-cyan-400/60 disabled:opacity-60"
                >
                  <FileDown className="h-4 w-4" />
                  {annualBusy
                    ? "Building…"
                    : features.annualHealthReport
                      ? "Annual Health Report"
                      : hideStorePurchaseUi()
                        ? "Annual Report"
                        : "Annual Report (Pro)"}
                </button>
              </>
            )}
            {isFree && <UpgradeButton label="Upgrade to Pro" />}
            {canAdd && vehicles.length >= 1 && (
              <button
                type="button"
                data-testid="add-vehicle-open"
                onClick={() => setShowAddVehicle(true)}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-700 px-3 text-sm text-slate-200 hover:border-cyan-500/50"
              >
                <Plus className="h-4 w-4" />
                Add vehicle
              </button>
            )}
            {!canAdd && vehicles.length >= 1 && onAddVehicle ? (
              <p
                data-testid="add-vehicle-limit"
                className="max-w-[14rem] text-xs leading-snug text-slate-500"
              >
                {t(
                  hideStorePurchaseUi()
                    ? "vehicles.planLimitStore"
                    : "vehicles.planLimit",
                  { count: features.maxVehicles },
                )}
              </p>
            ) : null}
            <div className="flex items-center gap-2 text-sm text-emerald-400">
              <div className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
              {vehicle?.vcdb?.source === "vcdb"
                ? "VCdb config synced"
                : vehicles.length === 0
                  ? "Garage empty"
                  : "AI Inspection Ready"}
            </div>
          </div>
        </div>

        {onAddVehicle && (
          <AddVehicleModal
            open={showAddVehicle}
            onClose={() => setShowAddVehicle(false)}
            onAdd={handleAddVehicle}
          />
        )}
        {onUpdateVehicle && (
          <AddVehicleModal
            open={Boolean(editingVehicle)}
            onClose={() => setEditingVehicle(null)}
            initialVehicle={editingVehicle}
            onSave={async (next) => {
              await onUpdateVehicle(next);
              setEditingVehicle(null);
            }}
          />
        )}

        <div className="relative mb-6 max-w-md">
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search areas (brake, engine, battery...)"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-2xl border border-slate-700 bg-slate-900 py-4 pl-12 pr-4 text-base outline-none focus:border-cyan-400"
          />
        </div>

        {normalizedSearch && (
          <div className="mb-6 flex flex-wrap gap-2">
            {filteredRegions.length > 0 ? (
              filteredRegions.map((region) => (
                <button
                  key={region.id}
                  type="button"
                  onClick={() => handleRegionClick(region)}
                  className="rounded-full border border-cyan-500/40 bg-cyan-500/10 px-4 py-2 text-sm text-cyan-300 hover:bg-cyan-500/20"
                >
                  {region.name}
                </button>
              ))
            ) : (
              <p className="text-sm text-slate-500">No areas match your search.</p>
            )}
          </div>
        )}

        {/* Interactive map — large tap regions */}
        <div className="relative mb-10 overflow-hidden rounded-3xl border border-slate-700 bg-[#111827] p-4 sm:p-10">
          <div className="mb-6 text-center sm:mb-8">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Vehicle Systems
            </h2>
            <p className="mt-2 text-slate-400">
              {activeFocus
                ? "AI Focus Mode — primary issue highlighted"
                : "Numbers mark real locations on this vehicle type. Tap a number or choose a system below"}
            </p>
          </div>

          {vehicle && (
            <div className="mb-5 flex flex-col items-center gap-3">
              <div className="flex w-full max-w-xl flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={handlePhotoDiagnosis}
                  disabled={isAnalyzingPhoto}
                  className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-500 px-6 py-3 text-sm font-medium text-white hover:brightness-110 disabled:opacity-40"
                >
                  <Camera className="h-5 w-5" />
                  {isAnalyzingPhoto
                    ? t("ai.analyzingPhoto")
                    : "Photo diagnosis & update"}
                </button>
                {showObdConnectEntry ? (
                  <button
                    type="button"
                    onClick={openObdConnect}
                    disabled={showObdModal}
                    className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-6 py-3 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-40"
                  >
                    <Bluetooth className="h-5 w-5" />
                    {t("obd.connectEntry")}
                  </button>
                ) : null}
              </div>
              <div className="flex flex-wrap justify-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    const engine = DASHBOARD_REGIONS.find(
                      (r) => r.id === "engine",
                    );
                    if (engine) handleRegionClick(engine);
                  }}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-5 text-sm font-medium text-amber-200"
                >
                  Quick: Engine bay
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const brakes = DASHBOARD_REGIONS.find(
                      (r) => r.id === "brakes",
                    );
                    if (brakes) handleRegionClick(brakes);
                  }}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-2xl border border-rose-500/40 bg-rose-500/10 px-5 text-sm font-medium text-rose-200"
                >
                  Quick: Brakes
                </button>
              </div>
            </div>
          )}
          {obdNote && (
            <p className="mb-4 text-center text-xs text-slate-400">{obdNote}</p>
          )}
          {visionNote && (
            <p className="mb-4 text-center text-xs text-cyan-300/90">
              {visionNote}
            </p>
          )}
          {isAnalyzingPhoto && (
            <p className="mb-4 text-center text-sm text-cyan-400">
              {t("ai.analyzingPhoto")}
            </p>
          )}

          <div className="relative">
            <VehicleSystemsDiagram
              vehicle={vehicle}
              regions={DASHBOARD_REGIONS}
              selectedRegionId={selectedRegion?.id ?? null}
              activeFocus={activeFocus}
              focusRegion={focusRegion}
              isRegionVisible={isRegionVisible}
              isRegionHighlighted={isRegionHighlighted}
              onRegionSelect={handleRegionClick}
            />
          </div>
        </div>

        {/* Status cards — dynamic from vitals + vehicle */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-2 lg:grid-cols-4 lg:gap-6">
          <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-[#111827] to-[#0a0f1c] p-4 sm:rounded-3xl sm:p-6 lg:p-7">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs text-emerald-400 sm:text-sm">Overall Health</p>
                <p className="mt-1.5 text-3xl font-bold sm:mt-2 sm:text-4xl lg:text-5xl">
                  {health != null ? `${health}%` : "—"}
                </p>
                <p className="mt-1 flex items-center gap-1 text-[11px] text-slate-500 sm:text-xs">
                  <TrendingUp className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">
                    {vitals ? healthTrendLabel(vitals.healthHistory) : "Add a vehicle"}
                  </span>
                </p>
              </div>
              <CheckCircle className="h-7 w-7 shrink-0 text-emerald-400 sm:h-10 sm:w-10 lg:h-12 lg:w-12" />
            </div>
          </div>

          <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-br from-[#111827] to-[#0a0f1c] p-4 sm:rounded-3xl sm:p-6 lg:p-7">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs text-amber-400 sm:text-sm">Next Service</p>
                <p className="mt-1.5 text-2xl font-bold sm:mt-2 sm:text-3xl lg:text-4xl">
                  {serviceEta?.miles === 0
                    ? "Due"
                    : serviceEta?.miles != null
                      ? serviceEta.miles.toLocaleString()
                      : "—"}
                </p>
                <p className="text-xs text-slate-400 sm:text-sm">
                  {serviceEta?.miles === 0 ? "service now" : "miles"}
                </p>
              </div>
              <Clock className="h-7 w-7 shrink-0 text-amber-400 sm:h-10 sm:w-10 lg:h-12 lg:w-12" />
            </div>
          </div>

          <div className="rounded-2xl border border-red-500/30 bg-gradient-to-br from-[#111827] to-[#0a0f1c] p-4 sm:rounded-3xl sm:p-6 lg:p-7">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs text-red-400 sm:text-sm">Active Alerts</p>
                <p className="mt-1.5 text-3xl font-bold sm:mt-2 sm:text-4xl lg:text-5xl">
                  {vehicle ? alertCount : "—"}
                </p>
                <p className="mt-1 text-[11px] text-slate-500 sm:text-xs">
                  DTCs + fluid warnings
                </p>
              </div>
              <AlertTriangle className="h-7 w-7 shrink-0 text-red-400 sm:h-10 sm:w-10 lg:h-12 lg:w-12" />
            </div>
          </div>

          <div className="col-span-2 rounded-2xl border border-cyan-500/30 bg-gradient-to-br from-[#111827] to-[#0a0f1c] p-4 sm:col-span-1 sm:rounded-3xl sm:p-6 lg:col-span-1 lg:p-7">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs text-cyan-400 sm:text-sm">Est. Market Band</p>
                <p className="mt-1.5 text-3xl font-bold sm:mt-2 sm:text-4xl lg:text-5xl">
                  {vehicle ? marketBand : "—"}
                </p>
                <p className="mt-1 truncate text-[11px] text-slate-500 sm:text-xs">
                  DIY ballpark · {vehicle ? normalizeVehicleMarket(vehicle.market) : "—"}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-3xl border border-slate-700 bg-[#111827] p-6 sm:p-8">
            <h3 className="mb-2 flex items-center gap-3 text-xl font-semibold">
              <Thermometer className="h-6 w-6 text-cyan-400" /> Fluid Levels &amp;
              Tire Pressure
            </h3>
            <p className="mb-5 text-xs text-slate-500">
              From OBD / photo / tap to edit — feeds health score
            </p>
            <div className="space-y-4">
              {(vitals?.fluids ?? []).map((item) => (
                <div
                  key={item.key}
                  className="flex flex-col gap-1 border-b border-slate-800 pb-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="text-sm text-slate-300">{item.label}</span>
                  <input
                    type="text"
                    value={item.value}
                    onChange={(e) => handleFluidEdit(item.key, e.target.value)}
                    disabled={!vitals}
                    className={`w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm sm:max-w-[220px] ${fluidTone(item.level)} focus:border-cyan-400 focus:outline-none`}
                  />
                </div>
              ))}
              {!vehicle && (
                <p className="text-sm text-slate-500">Select a vehicle to track fluids.</p>
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-700 bg-[#111827] p-6 sm:p-8">
            <h3 className="mb-2 text-xl font-semibold">Recent Diagnostic Codes</h3>
            <p className="mb-5 text-xs text-slate-500">
              OBD scan, photo vision, or manual entry · Ask AI uses market + RAG
            </p>
            <div className="space-y-3 text-sm">
              {(vitals?.codes ?? []).length === 0 ? (
                <p className="rounded-2xl border border-dashed border-slate-700 px-4 py-6 text-center text-slate-500">
                  No codes yet — Connect OBD, Photo diagnosis, or add one below.
                </p>
              ) : (
                vitals!.codes.map((c) => (
                  <div
                    key={`${c.code}-${c.recordedAt}`}
                    className="flex justify-between gap-3 rounded-2xl bg-slate-900 p-4"
                  >
                    <div className="min-w-0">
                      <div className="font-mono font-semibold text-white">
                        {c.code}
                      </div>
                      <div className="truncate text-slate-400">{c.desc}</div>
                      <div className="mt-1 text-[10px] uppercase tracking-wide text-slate-600">
                        {c.source}
                      </div>
                    </div>
                    <span className={`shrink-0 ${severityTone(c.severity)}`}>
                      {c.severity}
                    </span>
                  </div>
                ))
              )}
            </div>

            {/* Recommended Parts - Market-aware Affiliate Links */}
            {vehicle && vitals && vitals.codes.length > 0 && (
              <div className="mt-6 border-t border-slate-800 pt-5">
                <h4 className="mb-3 text-sm font-medium text-slate-200">
                  {t("parts.recommendedTitle")}
                </h4>
                <p className="mb-3 text-xs text-slate-500">
                  {t("parts.compareHint")}
                </p>

                {vitals.codes.slice(0, 2).map((c: DiagnosticCode) => {
                  const part = partQueryForDtc(c.code, c.desc);
                  const aff = getAffiliateLinks({
                    part,
                    vehicle,
                  });

                  return (
                    <a
                      key={`${c.code}-${c.recordedAt || "link"}`}
                      href={aff.primaryUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mb-3 block rounded-2xl bg-slate-900 p-4 transition hover:bg-slate-800"
                    >
                      <div className="font-mono text-sm font-semibold text-white">
                        {t("parts.fixForCode", { code: c.code })}
                      </div>
                      <div className="mt-1 text-xs text-slate-400">
                        {aff.searchQuery}
                      </div>
                      <div className="mt-2 text-xs font-medium text-cyan-300">
                        {t("parts.searchOnAmazon")} →
                      </div>
                    </a>
                  );
                })}
              </div>
            )}

            {vehicle && (
              <div className="mt-5 space-y-2 border-t border-slate-800 pt-4">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    type="text"
                    placeholder="Code e.g. P0300"
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value)}
                    className="min-h-[42px] flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm focus:border-cyan-400 focus:outline-none"
                  />
                  <input
                    type="text"
                    placeholder="Short description"
                    value={manualDesc}
                    onChange={(e) => setManualDesc(e.target.value)}
                    className="min-h-[42px] flex-[1.4] rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm focus:border-cyan-400 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleAddManualCode}
                    disabled={!manualCode.trim()}
                    className="min-h-[42px] rounded-xl bg-slate-700 px-4 text-sm disabled:opacity-40"
                  >
                    Add
                  </button>
                </div>
                {vitals && vitals.codes.length > 0 && (
                  <button
                    type="button"
                    onClick={handleAskAboutCodes}
                    className="text-sm text-cyan-400 hover:text-cyan-300"
                  >
                    Ask AI about these codes →
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Health Trend — SVG sparkline + last 5 snapshots */}
          <div className="rounded-2xl border border-slate-700 bg-[#111827] p-4 sm:rounded-3xl sm:p-6 md:col-span-2 lg:col-span-1 lg:p-8">
            <div className="mb-4 flex items-center gap-3">
              <TrendingUp className="h-6 w-6 text-emerald-400" />
              <h3 className="text-xl font-semibold">Health Trend</h3>
            </div>

            <div className="relative h-48 rounded-2xl bg-black/40 p-4">
              <svg
                width="100%"
                height="100%"
                viewBox="0 0 400 160"
                className="overflow-visible"
                aria-label="Health score trend"
              >
                <line
                  x1="24"
                  y1="144"
                  x2="376"
                  y2="144"
                  stroke="#334155"
                  strokeWidth="1"
                />
                <line
                  x1="24"
                  y1="16"
                  x2="24"
                  y2="144"
                  stroke="#334155"
                  strokeWidth="1"
                />
                {healthChart.points ? (
                  <>
                    <polyline
                      points={healthChart.points}
                      fill="none"
                      stroke="#22c55e"
                      strokeWidth="4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    {healthChart.dots.map((d, i) => (
                      <g key={`dot-${i}`}>
                        <circle cx={d.x} cy={d.y} r="5" fill="#22c55e" />
                        <text
                          x={d.x}
                          y={d.y - 10}
                          textAnchor="middle"
                          fill="#94a3b8"
                          fontSize="10"
                        >
                          {d.score}
                        </text>
                      </g>
                    ))}
                  </>
                ) : null}
              </svg>
              <div className="absolute bottom-3 left-6 text-xs text-slate-500">
                {vitalsHistory.length
                  ? "Last 5 snapshots — tap a point to restore"
                  : "No history yet — run Photo or OBD scan"}
              </div>
            </div>

            <div className="mt-5 space-y-2 text-sm">
              {vitalsHistory.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-700 px-4 py-5 text-center text-slate-500">
                  Photo / OBD scans will appear here. Tap a row to restore.
                </p>
              ) : (
                vitalsHistory.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => restoreSnapshot(row)}
                    className="flex w-full items-center justify-between gap-3 rounded-xl bg-slate-900/80 px-4 py-3 text-left hover:bg-slate-800"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <Clock className="h-4 w-4 shrink-0 text-slate-500" />
                      <span className="truncate text-slate-300">
                        {new Date(row.snapshot_at).toLocaleDateString()}{" "}
                        {new Date(row.snapshot_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="font-medium text-emerald-400">
                        {row.health_score != null ? `${row.health_score}%` : "—"}
                      </span>
                      <span className="text-[10px] uppercase tracking-wide text-slate-500">
                        {row.source}
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Real-time Sensors — after Fluids / Codes / Trend (product layout) */}
        {vehicle && (
          <div className="mt-8 rounded-3xl border border-slate-700 bg-[#111827] p-4 sm:p-6 lg:p-8">
            <h3 className="mb-4 flex items-center gap-3 text-lg font-semibold sm:mb-6 sm:text-xl">
              <Activity className="h-5 w-5 text-cyan-400 sm:h-6 sm:w-6" />
              Real-time Sensors
            </h3>
            <div className="grid grid-cols-2 gap-3 text-sm sm:gap-4 md:grid-cols-3">
              {LIVE_SENSOR_PIDS.map(({ key, label, unit }) => (
                <div
                  key={key}
                  className="rounded-2xl bg-black/40 p-3 sm:p-4"
                >
                  <div className="text-xs text-cyan-400 sm:text-sm">{label}</div>
                  <div className="mt-1 font-mono text-xl text-white sm:text-2xl">
                    {formatLiveSensorValue(liveSensors?.[key] ?? null, unit)}
                  </div>
                </div>
              ))}
            </div>
            {!hasLiveSensorData(liveSensors) && (
              <p className="mt-4 text-center text-xs text-slate-500">
                {showObdConnectEntry
                  ? `No live data yet — ${t("obd.connectEntry")} (Chrome + BLE ELM327), then Refresh Sensors.`
                  : t("obd.noAdapterLiveHint")}
              </p>
            )}
            <button
              type="button"
              data-testid="dashboard-refresh-sensors"
              data-obd-action={
                showObdConnectEntry ? "connect" : "settings"
              }
              onClick={() => void handleRefreshSensors()}
              disabled={isRefreshingSensors || showObdModal}
              className="mt-6 text-sm font-medium text-cyan-400 hover:text-cyan-300 disabled:opacity-40"
            >
              {isRefreshingSensors
                ? t("obd.refreshSensorsReading")
                : showObdConnectEntry
                  ? t("obd.refreshSensors")
                  : t("obd.enableAdapterCta")}
            </button>
          </div>
        )}

        {/* Push opt-in — predictive cards live in HomeHub above */}
        {vehicle && isWebPushSupported() && (
          <div className="mt-8 rounded-3xl border border-slate-800 bg-[#111827]/80 px-4 py-4 sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-slate-400">
                Get due-date nudges on this device when maintenance is coming up.
              </p>
              <button
                type="button"
                onClick={() => void handleEnablePush()}
                disabled={pushBusy}
                className="inline-flex min-h-[40px] items-center rounded-xl border border-emerald-500/40 px-3 text-xs font-medium text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-40"
              >
                {pushBusy ? "Enabling…" : "Enable Push"}
              </button>
            </div>
          </div>
        )}

        {/* Notifications inbox — reminder_deliveries (Edge / cron / in_app) */}
        {vehicle && (
          <div className="mt-8 rounded-3xl border border-slate-700 bg-[#111827] p-4 sm:p-6 lg:p-8">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h3 className="flex items-center gap-3 text-lg font-semibold sm:text-xl">
                <Bell className="h-5 w-5 text-cyan-400 sm:h-6 sm:w-6" />
                Notifications
              </h3>
              {inbox.some((n) => !n.read_at) && (
                <button
                  type="button"
                  onClick={() =>
                    void markAllRemindersRead(vehicle.id).then(() =>
                      loadInbox(vehicle.id),
                    )
                  }
                  className="text-xs text-cyan-400 hover:underline"
                >
                  Mark all read
                </button>
              )}
            </div>
            <p className="mb-4 text-xs text-slate-500">
              Service reminders from email, push, and in-app alerts
            </p>
            {inboxLoading ? (
              <p className="text-sm text-slate-500">Loading…</p>
            ) : inbox.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-slate-700 px-4 py-6 text-center text-sm text-slate-500">
                No reminders yet. Enable Push above to get due-date alerts on
                this device.
              </p>
            ) : (
              <ul className="space-y-2">
                {inbox.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() =>
                        void markReminderRead(n.id).then(() =>
                          loadInbox(vehicle.id),
                        )
                      }
                      className={`w-full rounded-2xl px-4 py-3 text-left transition ${
                        n.read_at
                          ? "bg-slate-950/50 text-slate-400"
                          : "bg-slate-900 text-slate-200 hover:bg-slate-800"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {n.title || "Maintenance reminder"}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {n.body || n.reason || "Service recommended"}
                          </p>
                        </div>
                        <span className="shrink-0 text-[10px] uppercase tracking-wide text-slate-600">
                          {n.channel}
                        </span>
                      </div>
                      <p className="mt-1 text-[10px] text-slate-600">
                        {new Date(n.sent_at).toLocaleString()}
                        {!n.read_at ? " · unread" : ""}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <CameraCapture
        open={showCamera}
        onClose={() => setShowCamera(false)}
        onCapture={handlePhotoCapture}
      />

      <ObdConnectModal
        open={showObdModal}
        onClose={() => {
          setShowObdModal(false);
        }}
        autoNotifyOnReady
        onSessionReady={applyLiveObdSession}
        onAskAi={onAskAI ? handleObdAskAi : undefined}
        askAiLabel={t("obd.diagnoseInChat")}
        vehicleId={vehicle?.id}
        onMileageSynced={(result) => {
          if (!vehicle) return;
          onMergeVehicleLocal?.(vehicle.id, {
            mileage: result.mileage,
            mileageUnit: result.unit,
          });
        }}
      />

      {selectedRegion && vehicle && !activeFocus && (
        <RegionDetailPanel
          region={selectedRegion}
          vehicle={vehicle}
          symptoms={symptoms}
          onSymptomsChange={(value) => {
            setSymptoms(value);
            setError(null);
          }}
          inspection={inspection}
          loading={loading}
          error={error}
          fromCache={fromCache}
          onClose={handleClose}
          onRequestAI={handleRequestAI}
          onGeneralOverview={handleGeneralOverview}
          onRefreshAI={handleRefreshAI}
          onAskAI={handleAskAI}
        />
      )}

      {activeFocus && focusRegion && (
        <FocusPanel
          region={focusRegion}
          command={activeFocus}
          bodyClass={inferVehicleBodyClass(vehicle)}
          onClose={clearFocus}
        />
      )}

      <UpgradeModal
        open={showAnnualUpgrade}
        onClose={() => setShowAnnualUpgrade(false)}
        reason="annual"
      />
    </div>
  );
}
