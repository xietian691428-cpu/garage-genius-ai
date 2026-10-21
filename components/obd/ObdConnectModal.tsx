"use client";

import { useEffect, useState } from "react";
import {
  Bluetooth,
  BluetoothConnected,
  BluetoothOff,
  Loader2,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  canUseObdSimulator,
  getObdConnector,
  getObdRuntimeSupport,
  isNativeBleRuntime,
  isNativeClassicRuntime,
  listBondedClassicDevices,
  OBD_PROTOCOL_CHOICES,
  OBD_SIM_SCENARIOS,
  rankClassicDevices,
  runObdSelfCheck,
  startClassicDiscovery,
  startNativeBleScan,
  stopClassicDiscovery,
  stopNativeBleScan,
  type ClassicScanDevice,
  type NativeBleScanDevice,
  type ObdLinkMode,
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
import ObdClearCodesModal from "@/components/obd/ObdClearCodesModal";
import ObdDiagnosticsPanel from "@/components/obd/ObdDiagnosticsPanel";
import { useObdPreference } from "@/hooks/useObdPreference";
import { useAuth } from "@/hooks/useAuth";
import {
  canStartObdBleConnect,
  shouldEmphasizeObdConnect,
} from "@/lib/obd-preference";
import { syncObdMileageToVehicle } from "@/lib/obd-mileage-sync-client";
import type { MileageUnit } from "@/lib/obd-mileage";
import { checkObdVin, type ObdVinResponse } from "@/lib/obd-vin-client";
import { getCapacitorPlatform, isNativeAndroid } from "@/lib/native-platform";
import type { ObdTransport } from "@/lib/obd-transport";
import { NativeBleTransport } from "@/lib/obd-transport-native";
import { NativeClassicTransport } from "@/lib/obd-transport-classic";

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
  const [classicDevices, setClassicDevices] = useState<ClassicScanDevice[]>([]);
  const androidClassic = isNativeAndroid() && isNativeClassicRuntime();
  const [linkMode, setLinkMode] = useState<ObdLinkMode>("ble");
  const [protocol, setProtocol] = useState("0");
  const [showAllProtocols, setShowAllProtocols] = useState(false);
  const [selfCheckText, setSelfCheckText] = useState<string | null>(null);
  const [selfCheckBusy, setSelfCheckBusy] = useState(false);
  const [selfCheckCopied, setSelfCheckCopied] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [clearBusy, setClearBusy] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);
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
    setClassicDevices([]);
    setSelfCheckText(null);
    void stopNativeBleScan();
    void stopClassicDiscovery();
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
  const useClassic = androidClassic && linkMode === "classic";

  useEffect(() => {
    if (!open || prefLoading) return;
    setError(null);
    setSnapshot(null);
    setMileageToast(null);
    setVinCheck(null);
    setScanning(false);
    setScanDevices([]);
    setClassicDevices([]);
    setSelfCheckText(null);
    setLinkMode("ble");
    setProtocol("0");
    void stopNativeBleScan();
    void stopClassicDiscovery();
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
    await stopClassicDiscovery();
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
    setClassicDevices([]);
    setScanning(true);
    try {
      if (useClassic) {
        const bonded = await listBondedClassicDevices();
        setClassicDevices(rankClassicDevices(bonded));
        await startClassicDiscovery((device) => {
          setClassicDevices((prev) => {
            if (prev.some((d) => d.address === device.address)) return prev;
            return rankClassicDevices([...prev, device]);
          });
        });
      } else {
        await startNativeBleScan((device) => {
          setScanDevices((prev) => {
            if (prev.some((d) => d.deviceId === device.deviceId)) return prev;
            return [...prev, device].sort(
              (a, b) => (b.rssi ?? -999) - (a.rssi ?? -999),
            );
          });
        }, { showAllDevices });
      }
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
    linkMode?: ObdLinkMode;
    protocol?: string;
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
    setSelfCheckText(null);
    const mode = options?.linkMode ?? linkMode;
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
          linkMode: mode,
          protocol: options?.protocol ?? protocol,
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
    setClassicDevices([]);
    setSelfCheckText(null);
    setClearOpen(false);
    setClearError(null);
    setPhase("guide");
  };

  const confirmClearCodes = async () => {
    const obd = getObdConnector();
    if (!obd.isConnected) {
      setClearError(t("obd.clearNeedConnect"));
      return;
    }
    setClearBusy(true);
    setClearError(null);
    try {
      const result = await obd.clearFaultCodes({
        onStep: (s) => setStep(s),
      });
      if (!result.ok || !result.snapshot) {
        setClearError(result.message || t("obd.errorGeneric"));
        return;
      }
      setSnapshot(result.snapshot);
      setConnectedName(obd.deviceName);
      setPhase("result");
      onSessionReady(result.snapshot);
      setClearOpen(false);
      setClearError(null);
    } catch (err) {
      setClearError(
        err instanceof Error ? err.message : t("obd.errorGeneric"),
      );
    } finally {
      setClearBusy(false);
      setStep(null);
    }
  };

  const runSelfCheck = async (device: {
    deviceId: string;
    deviceName?: string;
  }) => {
    if (!canStartObdBleConnect(pref)) {
      setError(t("obd.bleBlockedByPref"));
      setPhase("error");
      return;
    }
    await stopScan();
    setSelfCheckBusy(true);
    setSelfCheckCopied(false);
    setError(null);
    setSelfCheckText(null);
    let transport: ObdTransport | null = null;
    try {
      transport = useClassic
        ? await NativeClassicTransport.connect({
            address: device.deviceId,
            deviceName: device.deviceName,
          })
        : await NativeBleTransport.connect({
            deviceId: device.deviceId,
            deviceName: device.deviceName,
          });
      const result = await runObdSelfCheck({
        transport,
        platform: getCapacitorPlatform(),
        protocol,
      });
      setSelfCheckText(result.reportText);
      if (!result.ok) {
        setError(result.error || t("obd.selfCheckFailed"));
        setPhase("error");
      } else {
        setPhase("guide");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("obd.selfCheckFailed"));
      setPhase("error");
    } finally {
      transport?.disconnect();
      setSelfCheckBusy(false);
    }
  };

  const copySelfCheck = async () => {
    if (!selfCheckText) return;
    try {
      await navigator.clipboard.writeText(selfCheckText);
      setSelfCheckCopied(true);
    } catch {
      setSelfCheckCopied(false);
    }
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
  const protocolChoices = showAllProtocols
    ? OBD_PROTOCOL_CHOICES
    : OBD_PROTOCOL_CHOICES.filter((p) => p.preset);

  const vinDecodedLabel = vinCheck?.decoded
    ? [vinCheck.decoded.year, vinCheck.decoded.make, vinCheck.decoded.model]
        .filter(Boolean)
        .join(" ")
    : "";

  return (
    <>
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
                  {androidClassic
                    ? t("obd.dualModeBanner")
                    : t("obd.bleOnlyBanner")}
                </p>
              )}

              {androidClassic && showBleGuide ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setLinkMode("ble");
                      void stopScan();
                      setClassicDevices([]);
                    }}
                    className={`flex-1 rounded-xl px-3 py-2 text-xs font-semibold ${
                      linkMode === "ble"
                        ? "bg-cyan-500 text-black"
                        : "border border-slate-600 text-slate-300"
                    }`}
                  >
                    {t("obd.modeBle")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLinkMode("classic");
                      void stopScan();
                      setScanDevices([]);
                    }}
                    className={`flex-1 rounded-xl px-3 py-2 text-xs font-semibold ${
                      linkMode === "classic"
                        ? "bg-cyan-500 text-black"
                        : "border border-slate-600 text-slate-300"
                    }`}
                  >
                    {t("obd.modeClassic")}
                  </button>
                </div>
              ) : null}

              {showBleGuide ? (
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    {t("obd.protocolLabel")}
                  </label>
                  <select
                    value={protocol}
                    onChange={(e) => setProtocol(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                  >
                    {protocolChoices.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.id === "0"
                          ? t("obd.protocolAuto")
                          : `${p.id} — ${p.label}`}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setShowAllProtocols((v) => !v)}
                    className="mt-1 text-[11px] text-slate-400 underline-offset-2 hover:underline"
                  >
                    {showAllProtocols
                      ? t("obd.protocolShowPresets")
                      : t("obd.protocolShowAll")}
                  </button>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {t("obd.protocolHint")}
                  </p>
                </div>
              ) : null}

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

              {showBleGuide && (nativeBle || useClassic) ? (
                <div>
                  <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {useClassic
                      ? t("obd.selectClassicDevice")
                      : t("obd.selectDevice")}
                  </h3>
                  {scanning ? (
                    <p className="mb-2 flex items-center gap-2 text-xs text-cyan-200">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      {useClassic
                        ? t("obd.scanningClassic")
                        : t("obd.scanning")}
                    </p>
                  ) : null}
                  <p className="mb-2 text-[11px] text-slate-500">
                    {useClassic
                      ? t("obd.scanningClassicHint")
                      : t("obd.scanningHint")}
                  </p>
                  {useClassic ? (
                    classicDevices.length ? (
                      <ul className="space-y-2">
                        {classicDevices.map((d) => (
                          <li key={d.address} className="space-y-1">
                            <button
                              type="button"
                              onClick={() =>
                                void connectAndRead({
                                  deviceId: d.address,
                                  deviceName: d.name,
                                  linkMode: "classic",
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
                            <button
                              type="button"
                              disabled={selfCheckBusy}
                              onClick={() =>
                                void runSelfCheck({
                                  deviceId: d.address,
                                  deviceName: d.name,
                                })
                              }
                              className="w-full rounded-lg border border-slate-700 px-2 py-1.5 text-[11px] text-slate-400 hover:border-slate-500 disabled:opacity-50"
                            >
                              {selfCheckBusy
                                ? t("obd.selfCheckRunning")
                                : t("obd.selfCheckCta")}
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="rounded-xl border border-dashed border-slate-700 px-3 py-3 text-xs text-slate-400">
                        {t("obd.noClassicDevicesYet")}
                      </p>
                    )
                  ) : scanDevices.length ? (
                    <ul className="space-y-2">
                      {scanDevices.map((d) => (
                        <li key={d.deviceId} className="space-y-1">
                          <button
                            type="button"
                            onClick={() =>
                              void connectAndRead({
                                deviceId: d.deviceId,
                                deviceName: d.name,
                                linkMode: "ble",
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
                          <button
                            type="button"
                            disabled={selfCheckBusy}
                            onClick={() =>
                              void runSelfCheck({
                                deviceId: d.deviceId,
                                deviceName: d.name,
                              })
                            }
                            className="w-full rounded-lg border border-slate-700 px-2 py-1.5 text-[11px] text-slate-400 hover:border-slate-500 disabled:opacity-50"
                          >
                            {selfCheckBusy
                              ? t("obd.selfCheckRunning")
                              : t("obd.selfCheckCta")}
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

              {selfCheckText ? (
                <div className="rounded-xl border border-slate-700 bg-slate-950/80 p-3">
                  <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {t("obd.selfCheckTitle")}
                  </h3>
                  <pre className="max-h-40 overflow-auto whitespace-pre-wrap text-[11px] text-slate-300">
                    {selfCheckText}
                  </pre>
                  <button
                    type="button"
                    onClick={() => void copySelfCheck()}
                    className="mt-2 rounded-lg border border-cyan-500/40 px-3 py-1.5 text-xs font-semibold text-cyan-100 hover:bg-cyan-500/10"
                  >
                    {selfCheckCopied
                      ? t("obd.selfCheckCopied")
                      : t("obd.selfCheckCopy")}
                  </button>
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
                    {androidClassic
                      ? t("obd.dualModeNote")
                      : t("obd.bleOnlyNote")}
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

              <LiabilityDisclaimer variant="panel" />

              <ObdDiagnosticsPanel
                compact
                milOn={snapshot.milOn}
                codes={snapshot.codes.map((c) => ({
                  code: c.code,
                  desc: c.desc,
                  severity: c.severity,
                  kind: c.kind,
                }))}
                readiness={snapshot.readiness}
                smog={snapshot.smog}
                sensors={snapshot.sensors}
                unitSystem={unitSystem}
                connected={snapshot.connected}
                deviceName={snapshot.deviceName}
                clearCodesEnabled={Boolean(connectedName)}
                onClearCodes={() => {
                  setClearError(null);
                  setClearOpen(true);
                }}
              />

              {snapshot.freezeFrame ? (
                <div className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {snapshot.freezeFrame.dtc
                      ? t("obd.freezeFrameFor", { code: snapshot.freezeFrame.dtc })
                      : t("obd.freezeFrameTitle")}
                  </p>
                  <div className="grid grid-cols-2 gap-2 text-sm text-slate-300">
                    {snapshot.freezeFrame.values.map((v) => (
                      <div key={v.pid}>
                        <span className="text-slate-500">{v.label}: </span>
                        {formatObdValue(v.value, v.unit, unitSystem)}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-sm text-slate-300">
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
                  void (nativeBle || useClassic
                    ? startScan(true)
                    : connectAndRead({ showAllDevices: true }))
                }
                className="px-1 py-2.5 text-xs text-slate-400 underline-offset-2 hover:text-slate-200 hover:underline"
              >
                {useClassic
                  ? t("obd.discoverClassic")
                  : t("obd.showAllDevices")}
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
                  selfCheckBusy ||
                  (allowSim && !nativeBle && !useClassic && !connectedName)
                }
                onClick={() =>
                  void ((nativeBle || useClassic) && !connectedName
                    ? startScan(false)
                    : connectAndRead({ linkMode }))
                }
                className="ml-auto inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-cyan-500 px-3 py-2.5 text-sm font-semibold text-black hover:bg-cyan-400 disabled:opacity-50 sm:flex-none"
              >
                <Bluetooth className="h-4 w-4" />
                {connectedName
                  ? t("obd.readAgain")
                  : nativeBle || useClassic
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

    <ObdClearCodesModal
      open={clearOpen}
      busy={clearBusy}
      error={clearError}
      onCancel={() => {
        if (clearBusy) return;
        setClearOpen(false);
        setClearError(null);
      }}
      onConfirm={() => void confirmClearCodes()}
    />
    </>
  );
}
