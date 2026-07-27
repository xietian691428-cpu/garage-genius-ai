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
  formatLiveSensorValue,
  getObdConnector,
  getObdRuntimeSupport,
  LIVE_SENSOR_PIDS,
} from "@/lib/obd";
import type { ObdSessionSnapshot } from "@/lib/types/obd-session";
import { OBD_COMPATIBLE_DEVICES } from "@/lib/types/obd-session";
import { useBodyScrollLock } from "@/lib/hooks/useBodyScrollLock";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Called after a successful read — parent injects Chat diagnosis. */
  onSessionReady: (snapshot: ObdSessionSnapshot) => void;
};

type Phase = "guide" | "working" | "result" | "error";

/**
 * Connect OBD guide + BLE scan → structured session for Chat/Coach.
 * Does not modify CoachScenarioPlayer.
 */
export default function ObdConnectModal({
  open,
  onClose,
  onSessionReady,
}: Props) {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<Phase>("guide");
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<ObdSessionSnapshot | null>(null);
  const [connectedName, setConnectedName] = useState<string | null>(null);
  useBodyScrollLock(open);

  const support = getObdRuntimeSupport();

  useEffect(() => {
    if (!open) return;
    setPhase("guide");
    setError(null);
    setSnapshot(null);
    const obd = getObdConnector();
    setConnectedName(obd.isConnected ? obd.deviceName : null);
  }, [open]);

  if (!open) return null;

  const connectAndRead = async () => {
    setPhase("working");
    setError(null);
    try {
      const obd = getObdConnector();
      if (!obd.isConnected) {
        const result = await obd.connectDetailed({ timeoutMs: 45_000 });
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
      });
      if (!session.connected) {
        setError(session.note || t("obd.errorGeneric"));
        setPhase("error");
        return;
      }
      setSnapshot(session);
      setPhase("result");
      // Auto-inject Chat diagnosis (aligned with manual / screenshot DTC flow)
      onSessionReady(session);
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
    setPhase("guide");
  };

  const injectDiagnosis = () => {
    if (!snapshot) return;
    onSessionReady(snapshot);
    onClose();
  };

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
              {t("obd.connectTitle")}
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">{t("obd.connectSubtitle")}</p>
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
          {phase === "guide" || phase === "error" ? (
            <div className="space-y-4">
              {!support.supported ? (
                <p className="rounded-xl border border-amber-700/40 bg-amber-950/30 px-3 py-2 text-xs text-amber-100">
                  {support.message}
                </p>
              ) : null}

              {phase === "error" && error ? (
                <p className="rounded-xl border border-red-700/40 bg-red-950/30 px-3 py-2 text-xs text-red-100">
                  {error}
                </p>
              ) : null}

              {connectedName ? (
                <p className="flex items-center gap-2 text-xs text-emerald-400">
                  <BluetoothConnected className="h-3.5 w-3.5" />
                  {t("obd.connectedTo", { name: connectedName })}
                </p>
              ) : null}

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
              </div>

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
                <p className="mt-2 text-[11px] text-slate-600">{t("obd.bleOnlyNote")}</p>
              </div>
            </div>
          ) : null}

          {phase === "working" ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
              <p className="text-sm text-slate-300">{t("obd.working")}</p>
              <p className="text-xs text-slate-500">{t("obd.workingHint")}</p>
            </div>
          ) : null}

          {phase === "result" && snapshot ? (
            <div className="space-y-3">
              <p className="text-sm text-emerald-300">{snapshot.note}</p>
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2">
                <p className="mb-1 text-[11px] font-semibold uppercase text-slate-500">
                  {t("obd.codesTitle")}
                </p>
                {snapshot.codes.length ? (
                  <ul className="space-y-1 font-mono text-sm text-cyan-200">
                    {snapshot.codes.map((c) => (
                      <li key={c.code}>
                        {c.code}{" "}
                        <span className="font-sans text-xs text-slate-400">
                          — {c.desc}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-slate-400">{t("obd.noCodes")}</p>
                )}
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2">
                <p className="mb-1 text-[11px] font-semibold uppercase text-slate-500">
                  {t("obd.sensorsTitle")}
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs text-slate-300">
                  {LIVE_SENSOR_PIDS.map(({ key, label, unit }) => (
                    <div key={key}>
                      <span className="text-slate-500">{label}: </span>
                      {formatLiveSensorValue(snapshot.sensors[key], unit)}
                    </div>
                  ))}
                  <div>
                    <span className="text-slate-500">{t("obd.odometer")}: </span>
                    {snapshot.odometerKm != null
                      ? `${snapshot.odometerKm.toLocaleString()} km`
                      : "—"}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-wrap gap-2 border-t border-slate-800 px-4 py-3">
          {connectedName ? (
            <button
              type="button"
              onClick={disconnect}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-600 px-3 py-2.5 text-sm text-slate-300 hover:bg-slate-900"
            >
              <BluetoothOff className="h-4 w-4" />
              {t("obd.disconnect")}
            </button>
          ) : null}

          {phase === "result" && snapshot ? (
            <button
              type="button"
              onClick={injectDiagnosis}
              className="ml-auto inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-cyan-500 px-3 py-2.5 text-sm font-semibold text-black hover:bg-cyan-400 sm:flex-none"
            >
              {t("obd.diagnoseInChat")}
            </button>
          ) : (
            <button
              type="button"
              disabled={!support.supported || phase === "working"}
              onClick={() => void connectAndRead()}
              className="ml-auto inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-cyan-500 px-3 py-2.5 text-sm font-semibold text-black hover:bg-cyan-400 disabled:opacity-50 sm:flex-none"
            >
              <Bluetooth className="h-4 w-4" />
              {connectedName ? t("obd.readAgain") : t("obd.connectCta")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
