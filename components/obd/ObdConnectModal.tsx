"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Bluetooth,
  BluetoothConnected,
  BluetoothOff,
  CheckCircle2,
  CircleDashed,
  Loader2,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  canUseObdSimulator,
  formatLiveSensorValue,
  getObdConnector,
  getObdRuntimeSupport,
  isNativeBleRuntime,
  LIVE_SENSOR_PIDS,
  OBD_SIM_SCENARIOS,
  startNativeBleScan,
  stopNativeBleScan,
  type NativeBleScanDevice,
  type ObdScanStep,
  type ObdSimScenarioId,
} from "@/lib/obd";
import { formatObdValue, type ObdUnitSystem } from "@/lib/obd-units";
import type { ObdSessionSnapshot } from "@/lib/types/obd-session";
import {
  OBD_COMPATIBLE_DEVICES,
  OBD_LOCKED_DEVICES,
} from "@/lib/types/obd-session";
import { useBodyScrollLock } from "@/lib/hooks/useBodyScrollLock";
import LiabilityDisclaimer from "@/components/legal/LiabilityDisclaimer";
import { useObdPreference } from "@/hooks/useObdPreference";
import { useAuth } from "@/hooks/useAuth";
import {
  canStartObdBleConnect,
  shouldEmphasizeObdConnect,
} from "@/lib/obd-preference";
import { syncObdMileageToVehicle } from "@/lib/obd-mileage-sync-client";
import type { MileageUnit } from "@/lib/obd-mileage";
import { checkObdVin, type ObdVinResponse } from "@/lib/obd-vin-client";

type Props = {
  open: boolean;
  onClose: () => void;
  /**
   * Called after a successful read.
   * Chat/Coach: typically inject diagnosis.
   * Dashboard: sync vitals / live sensors.
   */
  onSessionReady: (snapshot: ObdSessionSnapshot) => void;
  /**
   * If false, skip auto `onSessionReady` on success (parent only gets
   * the explicit Ask AI / Diagnose CTA). Default true.
   */
  autoNotifyOnReady?: boolean;
  /**
   * Optional second action on result (Dashboard “Ask AI diagnosis”).
   * When set, the primary result CTA calls this instead of re-firing
   * `onSessionReady`.
   */
  onAskAi?: (snapshot: ObdSessionSnapshot) => void;
  askAiLabel?: string;
  /** Current garage vehicle — required for OBD mileage / VIN write-back. */
  vehicleId?: string | null;
  /** Local garage refresh after mileage was written (new reading only). */
  onMileageSynced?: (result: {
    mileage: number;
    unit: MileageUnit;
  }) => void;
  /** Display units; US owners default to °F / mph / miles. */
  unitSystem?: ObdUnitSystem;
};

type Phase = "pref" | "guide" | "working" | "result" | "error";

const KIND_STYLE = {
  stored: "border-red-500/40 bg-red-500/10 text-red-200",
  pending: "border-amber-500/40 bg-amber-500/10 text-amber-200",
  permanent: "border-violet-500/40 bg-violet-500/10 text-violet-200",
} as const;

/**
 * Connect OBD guide + scan → structured session for Chat/Coach/Dashboard.
 * Soft preference prompt when ownership is unset. Does not modify CoachScenarioPlayer.
 */
export default function ObdConnectModal({
  open,
  onClose,
  onSessionReady,
  autoNotifyOnReady = true,
  onAskAi,
  askAiLabel,
  vehicleId,
  onMileageSynced,
  unitSystem = "imperial",
}: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { pref, loading: prefLoading, setHasObdAdapter } = useObdPreference();
  const [phase, setPhase] = useState<Phase>("guide");
  const [step, setStep] = useState<ObdScanStep | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<ObdSessionSnapshot | null>(null);
  const [connectedName, setConnectedName] = useState<string | null>(null);
  const [prefBusy, setPrefBusy] = useState(false);
  const [mileageToast, setMileageToast] = useState<string | null>(null);
  const [vinCheck, setVinCheck] = useState<ObdVinResponse | null>(null);
  const [vinSaving, setVinSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanDevices, setScanDevices] = useState<NativeBleScanDevice[]>([]);
  useBodyScrollLock(open);
  const allowSim = canUseObdSimulator(user?.email);

  useEffect(() => {
    if (!mileageToast) return;
    const id = window.setTimeout(() => setMileageToast(null), 3200);
    return () => window.clearTimeout(id);
  }, [mileageToast]);

  useEffect(() => {
    if (open) return;
    setScanning(false);
    setScanDevices([]);
    void stopNativeBleScan();
  }, [open]);

  const maybeSyncMileage = async (session: ObdSessionSnapshot) => {
    if (!canStartObdBleConnect(pref)) return;
    if (!vehicleId || session.odometerKm == null) return;
    const result = await syncObdMileageToVehicle({
      vehicleId,
      odometerKm: session.odometerKm,
    });
    if (!result) return;
    if (result.updated && result.mileage != null && result.unit) {
      setMileageToast(
        result.message ||
          t("obd.mileageUpdated", {
            value: result.mileage.toLocaleString(),
            unit: result.unit === "km" ? "km" : "miles",
          }),
      );
      onMileageSynced?.({ mileage: result.mileage, unit: result.unit });
      return;
    }
    if (
      result.skipped === "decreased" ||
      result.skipped === "implausible_jump" ||
      result.skipped === "not_newer"
    ) {
      setMileageToast(
        result.message ||
          (result.skipped === "implausible_jump"
            ? t("obd.mileageSkippedJump")
            : t("obd.mileageSkippedDecrease")),
      );
    }
  };

  const maybeCheckVin = async (session: ObdSessionSnapshot) => {
    if (!vehicleId || !session.vin) return;
    setVinCheck(await checkObdVin({ vehicleId, vin: session.vin }));
  };

  const saveVin = async () => {
    if (!vehicleId || !snapshot?.vin) return;
    setVinSaving(true);
    try {
      const res = await checkObdVin({ vehicleId, vin: snapshot.vin, save: true });
      if (res) setVinCheck(res);
    } finally {
      setVinSaving(false);
    }
  };

  const support = getObdRuntimeSupport(user?.email);
  const emphasize = shouldEmphasizeObdConnect(pref);
  const nativeBle = isNativeBleRuntime();
  const showBleGuide = emphasize && support.supported;

  useEffect(() => {
    if (!open || prefLoading) return;
    setError(null);
    setSnapshot(null);
    setMileageToast(null);
    setVinCheck(null);
    setScanning(false);
    setScanDevices([]);
    void stopNativeBleScan();
    const obd = getObdConnector();
    setConnectedName(obd.isConnected ? obd.deviceName : null);
    if (pref.preferenceUnset) {
      setPhase("pref");
    } else if (!pref.hasObdAdapter) {
      // Explicitly said no — parent usually hides entry; soft tip only.
      setPhase("pref");
      setError(t("obd.noAdapterLiveHint"));
    } else {
      setPhase("guide");
    }
  }, [open, prefLoading, pref.preferenceUnset, pref.hasObdAdapter, t]);

  if (!open) return null;

  const savePrefAndContinue = async (has: boolean) => {
    setPrefBusy(true);
    try {
      await setHasObdAdapter(has);
      if (has) {
        setPhase("guide");
      } else {
        onClose();
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("obd.prefSaveFailed"),
      );
    } finally {
      setPrefBusy(false);
    }
  };

  const skipPref = () => {
    onClose();
  };

  const stopScan = async () => {
    setScanning(false);
    await stopNativeBleScan();
  };

  const startScan = async (showAllDevices = false) => {
    if (!canStartObdBleConnect(pref)) {
      setError(t("obd.bleBlockedByPref"));
      setPhase("error");
      return;
    }
    if (!support.supported) {
      setError(t("obd.browserUnsupported"));
      setPhase("error");
      return;
    }
    setPhase("guide");
    setError(null);
    setScanDevices([]);
    setScanning(true);
    try {
      await startNativeBleScan((device) => {
        setScanDevices((prev) => {
          if (prev.some((d) => d.deviceId === device.deviceId)) return prev;
          return [...prev, device].sort((a, b) => (b.rssi ?? -999) - (a.rssi ?? -999));
        });
      }, { showAllDevices });
    } catch (err) {
      setScanning(false);
      setError(err instanceof Error ? err.message : t("obd.errorGeneric"));
      setPhase("error");
    }
  };

  const connectAndRead = async (options?: {
    showAllDevices?: boolean;
    deviceId?: string;
    deviceName?: string;
    simScenario?: ObdSimScenarioId;
  }) => {
    if (!canStartObdBleConnect(pref)) {
      setError(t("obd.bleBlockedByPref"));
      setPhase("error");
      return;
    }
    await stopScan();
    setPhase("working");
    setStep(null);
    setError(null);
    setVinCheck(null);
    try {
      const obd = getObdConnector();
      // Switching to a sim scenario always reconnects with a fresh scripted bus.
      if (options?.simScenario && obd.isConnected) {
        obd.disconnect();
        setConnectedName(null);
      }
      if (!obd.isConnected) {
        const result = await obd.connectDetailed({
          timeoutMs: 45_000,
          showAllDevices: options?.showAllDevices,
          deviceId: options?.deviceId,
          deviceName: options?.deviceName,
          simScenario: options?.simScenario,
          email: user?.email,
          onStep: setStep,
        });
        if (!result.ok) {
          setError(result.message);
          setPhase("error");
          return;
        }
        setConnectedName(result.deviceName);
      } else {
        setConnectedName(obd.deviceName);
      }

      const session = await obd.readSessionSnapshot({
        connectIfNeeded: false,
        includeSensors: true,
        onStep: setStep,
      });
      if (!session.connected) {
        if (!obd.isConnected) setConnectedName(null);
        setError(session.note || t("obd.errorGeneric"));
        setPhase("error");
        return;
      }
      setSnapshot(session);
      setPhase("result");
      setScanDevices([]);
      void maybeSyncMileage(session);
      void maybeCheckVin(session);
      if (autoNotifyOnReady) {
        onSessionReady(session);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("obd.errorGeneric"),
      );
      setPhase("error");
    }
  };

  const disconnect = () => {
    getObdConnector().disconnect();
    setConnectedName(null);
    setSnapshot(null);
    setVinCheck(null);
    setScanDevices([]);
    setPhase("guide");
  };

  const primaryResultAction = () => {
    if (!snapshot) return;
    if (onAskAi) {
      onAskAi(snapshot);
      onClose();
      return;
    }
    onSessionReady(snapshot);
    onClose();
  };

  const unsupportedMessage = t("obd.browserUnsupported");

  const vinDecodedLabel = vinCheck?.decoded
    ? [vinCheck.decoded.year, vinCheck.decoded.make, vinCheck.decoded.model]
        .filter(Boolean)
        .join(" ")
    : "";

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="obd-connect-title"
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-700 bg-[#111827] shadow-xl"
      >
        <div className="flex shrink-0 items-start justify-between gap-2 border-b border-slate-800 px-4 py-3">
          <div>
            <h2
              id="obd-connect-title"
              className="text-base font-semibold text-white"
            >
              {phase === "pref"
                ? t("obd.prefPromptTitle")
                : t("obd.connectTitle")}
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">
              {phase === "pref"
                ? t("obd.prefPromptSubtitle")
                : t("obd.connectSubtitle")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
            aria-label={t("common.cancel")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {phase === "pref" ? (
            <div className="space-y-4">
              <p className="text-sm leading-relaxed text-slate-300">
                {t("obd.prefPromptBody")}
              </p>
              <p className="text-xs text-slate-500">{t("obd.prefPromptNote")}</p>
              {error ? (
                <p className="rounded-xl border border-red-700/40 bg-red-950/30 px-3 py-2 text-xs text-red-100">
                  {error}
                </p>
              ) : null}
              <div className="grid gap-2">
                <button
                  type="button"
                  disabled={prefBusy}
                  onClick={() => void savePrefAndContinue(true)}
                  className="rounded-2xl bg-cyan-500 px-4 py-3 text-sm font-semibold text-black hover:bg-cyan-400 disabled:opacity-50"
                >
                  {t("obd.prefYes")}
                </button>
                <button
                  type="button"
                  disabled={prefBusy}
                  onClick={() => void savePrefAndContinue(false)}
                  className="rounded-2xl border border-slate-600 px-4 py-3 text-sm text-slate-200 hover:border-slate-500 disabled:opacity-50"
                >
                  {t("obd.prefNo")}
                </button>
                <button
                  type="button"
                  disabled={prefBusy}
                  onClick={skipPref}
                  className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 disabled:opacity-50"
                >
                  {t("obd.prefSkip")}
                </button>
              </div>
            </div>
          ) : null}

          {phase === "guide" || phase === "error" ? (
            <div className="space-y-4">
              {!support.supported ? (
                <p className="rounded-xl border border-amber-700/40 bg-amber-950/30 px-3 py-2 text-xs text-amber-100">
                  {unsupportedMessage}
                </p>
              ) : (
                <p className="rounded-xl border border-cyan-700/40 bg-cyan-950/30 px-3 py-2 text-xs text-cyan-100">
                  {t("obd.bleOnlyBanner")}
                </p>
              )}

              {phase === "error" && error ? (
                <p className="rounded-xl border border-red-700/40 bg-red-950/30 px-3 py-2 text-xs leading-relaxed text-red-100">
                  {error}
                </p>
              ) : null}

              {connectedName ? (
                <p className="flex items-center gap-2 text-xs text-emerald-400">
                  <BluetoothConnected className="h-3.5 w-3.5" />
                  {t("obd.connectedTo", { name: connectedName })}
                </p>
              ) : null}

              {showBleGuide ? (
                <div>
                  <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {t("obd.stepsTitle")}
                  </h3>
                  <ol className="list-decimal space-y-1 pl-4 text-sm text-slate-300">
                    <li>{t("obd.step1")}</li>
                    <li>{t("obd.step2")}</li>
                    <li>{t("obd.step3")}</li>
                    <li>{t("obd.step4")}</li>
                  </ol>
                  <p className="mt-2 text-[11px] text-slate-500">
                    {t("obd.closeOtherAppsHint")}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-slate-300">
                  {t("obd.iosPreferManual")}
                </p>
              )}

              {showBleGuide && allowSim ? (
                <div>
                  <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {t("obd.simTitle")}
                  </h3>
                  <p className="mb-2 text-[11px] text-amber-200/90">
                    {t("obd.simBanner")}
                  </p>
                  <ul className="space-y-2">
                    {OBD_SIM_SCENARIOS.map((s) => (
                      <li key={s.id}>
                        <button
                          type="button"
                          onClick={() =>
                            void connectAndRead({ simScenario: s.id })
                          }
                          className="flex w-full flex-col gap-0.5 rounded-xl border border-amber-700/40 bg-amber-950/20 px-3 py-2.5 text-left hover:border-amber-500/50 hover:bg-amber-950/40"
                        >
                          <span className="text-sm font-medium text-amber-100">
                            {s.label}
                          </span>
                          <span className="text-[11px] text-slate-400">
                            {s.note}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {showBleGuide && nativeBle ? (
                <div>
                  <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {t("obd.selectDevice")}
                  </h3>
                  {scanning ? (
                    <p className="mb-2 flex items-center gap-2 text-xs text-cyan-200">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      {t("obd.scanning")}
                    </p>
                  ) : null}
                  <p className="mb-2 text-[11px] text-slate-500">
                    {t("obd.scanningHint")}
                  </p>
                  {scanDevices.length ? (
                    <ul className="space-y-2">
                      {scanDevices.map((d) => (
                        <li key={d.deviceId}>
                          <button
                            type="button"
                            onClick={() =>
                              void connectAndRead({
                                deviceId: d.deviceId,
                                deviceName: d.name,
                              })
                            }
                            className="flex w-full items-center justify-between gap-2 rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2.5 text-left hover:border-cyan-500/50 hover:bg-slate-900"
                          >
                            <span className="text-sm font-medium text-slate-100">
                              {d.name}
                            </span>
                            {d.rssi != null ? (
                              <span className="text-[11px] text-slate-500">
                                {d.rssi} dBm
                              </span>
                            ) : null}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="rounded-xl border border-dashed border-slate-700 px-3 py-3 text-xs text-slate-400">
                      {t("obd.noDevicesYet")}
                    </p>
                  )}
                </div>
              ) : null}

              {showBleGuide ? (
                <div>
                  <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {t("obd.devicesTitle")}
                  </h3>
                  <ul className="space-y-2">
                    {OBD_COMPATIBLE_DEVICES.map((d) => (
                      <li
                        key={d.id}
                        className="rounded-xl border border-slate-800 bg-slate-950/50 px-3 py-2"
                      >
                        <p className="text-sm font-medium text-slate-200">
                          {d.name}
                        </p>
                        <p className="text-[11px] text-slate-500">{d.notes}</p>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-[11px] text-slate-500">
                    {t("obd.bleOnlyNote")}
                  </p>
                  {!nativeBle ? (
                    <p className="mt-1 text-[11px] text-slate-500">
                      {t("obd.bleWebNote")}
                    </p>
                  ) : null}
                  <p className="mt-1 text-[11px] text-slate-500">
                    {t("obd.lockedNote", { list: OBD_LOCKED_DEVICES.join(", ") })}
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}

          {phase === "working" ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
              <p className="text-sm text-slate-300">
                {step ? t(`obd.step_${step}`) : t("obd.working")}
              </p>
              <p className="text-xs text-slate-500">{t("obd.workingHint")}</p>
            </div>
          ) : null}

          {phase === "result" && snapshot ? (
            <div className="space-y-3">
              <p className="text-sm text-emerald-300">{snapshot.note}</p>
              {mileageToast ? (
                <p
                  className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs font-medium text-cyan-100"
                  role="status"
                >
                  {mileageToast}
                </p>
              ) : null}
              <p className="text-xs text-slate-400">
                {onAskAi ? t("obd.dashboardSyncedHint") : t("obd.injectedHint")}
              </p>

              {snapshot.milOn != null ? (
                <p
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium ${
                    snapshot.milOn
                      ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
                      : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                  }`}
                >
                  {snapshot.milOn ? (
                    <AlertTriangle className="h-4 w-4" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  {snapshot.milOn ? t("obd.milOn") : t("obd.milOff")}
                </p>
              ) : null}

              <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2">
                <p className="mb-1 text-[11px] font-semibold uppercase text-slate-500">
                  {t("obd.codesTitle")}
                </p>
                {snapshot.codes.length ? (
                  <>
                    <ul className="space-y-1.5">
                      {snapshot.codes.map((c) => (
                        <li key={c.code} className="text-sm">
                          <span className="font-mono text-cyan-200">{c.code}</span>
                          {c.kind ? (
                            <span
                              className={`ml-2 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase ${KIND_STYLE[c.kind]}`}
                            >
                              {t(`obd.kind_${c.kind}`)}
                            </span>
                          ) : null}
                          <span className="block text-xs text-slate-400">{c.desc}</span>
                        </li>
                      ))}
                    </ul>
                    {snapshot.codes.some((c) => c.kind && c.kind !== "stored") ? (
                      <p className="mt-2 text-[11px] text-slate-500">{t("obd.kindHelp")}</p>
                    ) : null}
                  </>
                ) : (
                  <p className="text-xs text-slate-400">{t("obd.noCodes")}</p>
                )}
              </div>

              {snapshot.readiness && snapshot.smog ? (
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2">
                  <p className="mb-1 text-[11px] font-semibold uppercase text-slate-500">
                    {t("obd.readinessTitle")}
                  </p>
                  <p
                    className={`text-sm font-medium ${
                      snapshot.smog.verdict === "ready"
                        ? "text-emerald-300"
                        : snapshot.smog.verdict === "unknown"
                          ? "text-slate-300"
                          : "text-amber-200"
                    }`}
                  >
                    {t(`obd.smog_${snapshot.smog.verdict}`, {
                      count: snapshot.smog.incomplete.length,
                    })}
                  </p>
                  <ul className="mt-2 grid grid-cols-1 gap-1 text-xs sm:grid-cols-2">
                    {snapshot.readiness.monitors.map((m) => (
                      <li key={m.id} className="flex items-center gap-1.5 text-slate-300">
                        {m.ready ? (
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                        ) : (
                          <CircleDashed className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                        )}
                        {m.label}
                        <span className="text-slate-500">
                          · {m.ready ? t("obd.monitorReady") : t("obd.monitorIncomplete")}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-[11px] text-slate-500">{t("obd.smogNote")}</p>
                </div>
              ) : null}

              {snapshot.freezeFrame ? (
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2">
                  <p className="mb-1 text-[11px] font-semibold uppercase text-slate-500">
                    {snapshot.freezeFrame.dtc
                      ? t("obd.freezeFrameFor", { code: snapshot.freezeFrame.dtc })
                      : t("obd.freezeFrameTitle")}
                  </p>
                  <div className="grid grid-cols-2 gap-2 text-xs text-slate-300">
                    {snapshot.freezeFrame.values.map((v) => (
                      <div key={v.pid}>
                        <span className="text-slate-500">{v.label}: </span>
                        {formatObdValue(v.value, v.unit, unitSystem)}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <LiabilityDisclaimer variant="panel" />

              <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2">
                <p className="mb-1 text-[11px] font-semibold uppercase text-slate-500">
                  {t("obd.sensorsTitle")}
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs text-slate-300">
                  {LIVE_SENSOR_PIDS.map(({ key, label, unit }) => (
                    <div key={key}>
                      <span className="text-slate-500">{label}: </span>
                      {formatLiveSensorValue(snapshot.sensors[key], unit, unitSystem)}
                    </div>
                  ))}
                  <div>
                    <span className="text-slate-500">{t("obd.odometer")}: </span>
                    {formatObdValue(snapshot.odometerKm, "km", unitSystem)}
                  </div>
                  {snapshot.distanceSinceCodesClearedKm != null ? (
                    <div>
                      <span className="text-slate-500">{t("obd.distanceSinceClear")}: </span>
                      {formatObdValue(snapshot.distanceSinceCodesClearedKm, "km", unitSystem)}
                    </div>
                  ) : null}
                  {snapshot.adapter?.batteryVoltage != null ? (
                    <div>
                      <span className="text-slate-500">{t("obd.batteryVoltage")}: </span>
                      {formatObdValue(snapshot.adapter.batteryVoltage, "V")}
                    </div>
                  ) : null}
                </div>
              </div>

              {snapshot.vin ? (
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2">
                  <p className="mb-1 text-[11px] font-semibold uppercase text-slate-500">
                    {t("obd.vinTitle")}
                  </p>
                  <p className="font-mono text-sm tracking-wide text-slate-200">{snapshot.vin}</p>
                  {vinDecodedLabel ? (
                    <p className="text-xs text-slate-400">
                      {t("obd.vinDecoded", { label: vinDecodedLabel })}
                    </p>
                  ) : null}
                  {vinCheck ? (
                    <p
                      className={`mt-1 text-xs ${
                        vinCheck.status === "mismatch" ? "text-amber-200" : "text-slate-300"
                      }`}
                    >
                      {t(`obd.vin_${vinCheck.status}`)}
                    </p>
                  ) : null}
                  {vinCheck?.status === "missing" ? (
                    <button
                      type="button"
                      disabled={vinSaving}
                      onClick={() => void saveVin()}
                      className="mt-2 rounded-lg border border-cyan-500/50 px-3 py-1.5 text-xs font-semibold text-cyan-100 hover:bg-cyan-500/15 disabled:opacity-50"
                    >
                      {t("obd.vinSave")}
                    </button>
                  ) : null}
                </div>
              ) : null}

              {snapshot.adapter?.version || snapshot.adapter?.protocol ? (
                <p className="text-[11px] text-slate-600">
                  {[snapshot.deviceName, snapshot.adapter.version, snapshot.adapter.protocol]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        {phase !== "pref" &&
        !prefLoading &&
        canStartObdBleConnect(pref) &&
        support.supported ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-slate-800 px-4 py-3">
            {connectedName ? (
              <button
                type="button"
                onClick={disconnect}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-600 px-3 py-2.5 text-sm text-slate-300 hover:bg-slate-900"
              >
                <BluetoothOff className="h-4 w-4" />
                {t("obd.disconnect")}
              </button>
            ) : phase === "guide" || phase === "error" ? (
              <button
                type="button"
                onClick={() =>
                  void (nativeBle
                    ? startScan(true)
                    : connectAndRead({ showAllDevices: true }))
                }
                className="px-1 py-2.5 text-xs text-slate-400 underline-offset-2 hover:text-slate-200 hover:underline"
              >
                {t("obd.showAllDevices")}
              </button>
            ) : null}

            {scanning && !connectedName ? (
              <button
                type="button"
                onClick={() => void stopScan()}
                className="rounded-xl border border-slate-600 px-3 py-2.5 text-sm text-slate-300 hover:bg-slate-900"
              >
                {t("obd.stopScan")}
              </button>
            ) : null}

            {phase === "result" && snapshot ? (
              <button
                type="button"
                onClick={primaryResultAction}
                className="ml-auto inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-cyan-500 px-3 py-2.5 text-sm font-semibold text-black hover:bg-cyan-400 sm:flex-none"
              >
                {askAiLabel || t("obd.diagnoseInChat")}
              </button>
            ) : (
              <button
                type="button"
                disabled={
                  !support.supported ||
                  phase === "working" ||
                  (allowSim && !nativeBle && !connectedName)
                }
                onClick={() =>
                  void (nativeBle && !connectedName
                    ? startScan(false)
                    : connectAndRead())
                }
                className="ml-auto inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-cyan-500 px-3 py-2.5 text-sm font-semibold text-black hover:bg-cyan-400 disabled:opacity-50 sm:flex-none"
              >
                <Bluetooth className="h-4 w-4" />
                {connectedName
                  ? t("obd.readAgain")
                  : nativeBle
                    ? scanning
                      ? t("obd.scanAgain")
                      : t("obd.scanCta")
                    : allowSim
                      ? t("obd.simPickHint")
                      : t("obd.connectCta")}
              </button>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
