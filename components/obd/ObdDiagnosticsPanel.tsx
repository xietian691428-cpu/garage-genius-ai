"use client";

import {
  Activity,
  AlertTriangle,
  Bluetooth,
  BluetoothConnected,
  CheckCircle2,
  CircleDashed,
  Droplets,
  Fan,
  Flame,
  Fuel,
  Gauge,
  Thermometer,
  Waves,
  Wind,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  LIVE_SENSOR_PIDS,
  formatLiveSensorValue,
  hasLiveSensorData,
  type ObdLiveSensors,
} from "@/lib/obd";
import type { ObdReadiness, ReadinessMonitorId, SmogReadiness } from "@/lib/obd-protocol";
import type { ObdUnitSystem } from "@/lib/obd-units";

export type ObdPanelCode = {
  code: string;
  desc: string;
  severity?: string;
  recordedAt?: string;
  kind?: string;
};

type Props = {
  milOn?: boolean | null;
  codes: ObdPanelCode[];
  readiness?: ObdReadiness | null;
  smog?: SmogReadiness | null;
  sensors?: ObdLiveSensors | null;
  unitSystem?: ObdUnitSystem;
  connected?: boolean;
  deviceName?: string | null;
  isRefreshing?: boolean;
  showConnectCta?: boolean;
  onConnect?: () => void;
  onRefreshSensors?: () => void;
  onAskAboutCodes?: () => void;
  /** Shown after risk disclaimer — opens Mode 04 clear gate. */
  onClearCodes?: () => void;
  clearCodesEnabled?: boolean;
  /** Override refresh button label (e.g. enable adapter CTA). */
  refreshLabel?: string;
  refreshTestId?: string;
  refreshObdAction?: "connect" | "settings" | "refresh";
  /** Modal / compact: hide page chrome title */
  compact?: boolean;
};

const MONITOR_ICON: Partial<Record<ReadinessMonitorId, LucideIcon>> = {
  catalyst: Flame,
  heated_catalyst: Flame,
  nmhc_catalyst: Flame,
  evap: Droplets,
  o2_sensor: Waves,
  o2_heater: Waves,
  exhaust_gas_sensor: Waves,
  egr: Wind,
  egr_vvt: Wind,
  secondary_air: Fan,
  fuel_system: Fuel,
  misfire: Activity,
  components: Gauge,
  ac_refrigerant: Thermometer,
  boost_pressure: Gauge,
  nox_scr: Wind,
  pm_filter: CircleDashed,
};

const SENSOR_ICON: Record<string, LucideIcon> = {
  rpm: Gauge,
  coolantC: Thermometer,
  speedKph: Gauge,
  throttlePct: Activity,
  voltage: Zap,
  oilTempC: Thermometer,
};

function severityDot(severity?: string): string {
  const s = (severity ?? "").toLowerCase();
  if (s.includes("high")) return "bg-red-400";
  if (s.includes("moderate") || s.includes("medium")) return "bg-cyan-400";
  if (s.includes("low")) return "bg-amber-400";
  return "bg-slate-400";
}

function formatCodeTime(iso?: string): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

/**
 * Icon-forward OBD summary for US/EU DIY owners — large status words,
 * metric numerals, and monitor glyphs so older eyes can scan quickly.
 */
export default function ObdDiagnosticsPanel({
  milOn = null,
  codes,
  readiness = null,
  smog = null,
  sensors = null,
  unitSystem = "imperial",
  connected = false,
  deviceName = null,
  isRefreshing = false,
  showConnectCta = false,
  onConnect,
  onRefreshSensors,
  onAskAboutCodes,
  onClearCodes,
  clearCodesEnabled = false,
  refreshLabel,
  refreshTestId = "dashboard-refresh-sensors",
  refreshObdAction,
  compact = false,
}: Props) {
  const { t } = useTranslation();
  const milKnown = milOn != null;
  const milActive = milOn === true;
  const featuredCode = codes[0] ?? null;
  const monitors = readiness?.monitors?.slice(0, 6) ?? [];
  const smogReady = smog?.verdict === "ready";
  const live = hasLiveSensorData(sensors);
  const primarySensors = LIVE_SENSOR_PIDS.filter((p) =>
    p.key === "rpm" || p.key === "coolantC",
  );
  const extraSensors = LIVE_SENSOR_PIDS.filter(
    (p) => p.key !== "rpm" && p.key !== "coolantC",
  );

  return (
    <section
      className="space-y-4"
      aria-label={t("obd.diagnosticsTitle")}
      data-testid="obd-diagnostics-panel"
    >
      {!compact ? (
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              {t("obd.diagnosticsTitle")}
            </h2>
            <p className="mt-1 text-base text-slate-400">
              {t("obd.diagnosticsSubtitle")}
            </p>
          </div>
          <div
            className={`inline-flex shrink-0 items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-semibold ${
              connected
                ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-200"
                : "border-slate-700 bg-slate-900/80 text-slate-400"
            }`}
          >
            {connected ? (
              <BluetoothConnected className="h-5 w-5 text-cyan-300" aria-hidden />
            ) : (
              <Bluetooth className="h-5 w-5" aria-hidden />
            )}
            <span className="max-w-[9rem] truncate">
              {connected
                ? deviceName || t("obd.statusConnected")
                : t("obd.statusDisconnected")}
            </span>
          </div>
        </header>
      ) : null}

      {/* Check light */}
      <div
        className={`rounded-3xl border p-5 sm:p-6 ${
          milActive
            ? "border-amber-500/40 bg-gradient-to-br from-amber-950/40 to-[#111827]"
            : milKnown
              ? "border-emerald-500/30 bg-gradient-to-br from-emerald-950/30 to-[#111827]"
              : "border-slate-700 bg-[#111827]"
        }`}
      >
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
          {t("obd.checkLightTitle")}
        </p>
        <div className="mt-4 flex items-center gap-4">
          <div
            className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl sm:h-20 sm:w-20 ${
              milActive
                ? "bg-amber-500/15 text-amber-300"
                : milKnown
                  ? "bg-emerald-500/15 text-emerald-300"
                  : "bg-slate-800 text-slate-500"
            }`}
            aria-hidden
          >
            <Activity className="h-9 w-9 sm:h-10 sm:w-10" strokeWidth={2.25} />
          </div>
          <div className="min-w-0 flex-1">
            <p
              className={`text-4xl font-bold tracking-tight sm:text-5xl ${
                milActive
                  ? "text-amber-300"
                  : milKnown
                    ? "text-emerald-400"
                    : "text-slate-500"
              }`}
            >
              {milKnown
                ? milActive
                  ? t("obd.checkLightOnShort")
                  : t("obd.checkLightOffShort")
                : "—"}
            </p>
            <p className="mt-1 text-base text-slate-400">
              {milKnown
                ? milActive
                  ? t("obd.checkLightOnHint")
                  : t("obd.checkLightOffHint")
                : t("obd.checkLightUnknown")}
            </p>
          </div>
        </div>
      </div>

      {/* Fault codes */}
      <div className="rounded-3xl border border-slate-700 bg-[#111827] p-5 sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
            {t("obd.codesTitle")}
          </p>
          {codes.length > 1 && onAskAboutCodes ? (
            <button
              type="button"
              onClick={onAskAboutCodes}
              className="text-sm font-semibold text-cyan-300 hover:text-cyan-200"
            >
              {t("obd.viewAllCodes")}
            </button>
          ) : null}
        </div>

        {featuredCode ? (
          <div className="rounded-2xl border border-slate-800 bg-black/35 p-4 sm:p-5">
            <div className="flex gap-4">
              <div
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-cyan-500/15 text-cyan-300"
                aria-hidden
              >
                <AlertTriangle className="h-8 w-8" strokeWidth={2.25} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-mono text-3xl font-bold tracking-wide text-cyan-300 sm:text-4xl">
                  {featuredCode.code}
                </p>
                <p className="mt-1 text-base leading-snug text-slate-200">
                  {featuredCode.desc}
                </p>
                {featuredCode.severity ? (
                  <p className="mt-2 inline-flex items-center gap-2 text-sm text-slate-400">
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${severityDot(featuredCode.severity)}`}
                      aria-hidden
                    />
                    {featuredCode.severity}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800/80 pt-3">
              <p className="text-sm text-slate-500">
                {formatCodeTime(featuredCode.recordedAt)}
              </p>
              {onAskAboutCodes ? (
                <button
                  type="button"
                  onClick={onAskAboutCodes}
                  className="inline-flex min-h-[44px] items-center rounded-full border border-cyan-500/40 bg-cyan-500/10 px-4 text-sm font-semibold text-cyan-200"
                >
                  {t("obd.codeDetailsCta")}
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="rounded-2xl border border-dashed border-slate-700 px-4 py-6 text-center text-base text-slate-400">
            {t("obd.noCodes")}
          </p>
        )}

        {codes.length > 1 ? (
          <ul className="mt-3 space-y-2">
            {codes.slice(1, 4).map((c) => (
              <li
                key={`${c.code}-${c.recordedAt ?? ""}`}
                className="flex items-center gap-3 rounded-2xl bg-slate-900/80 px-4 py-3"
              >
                <AlertTriangle className="h-5 w-5 shrink-0 text-cyan-400/80" />
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-lg font-semibold text-white">
                    {c.code}
                  </p>
                  <p className="truncate text-sm text-slate-400">{c.desc}</p>
                </div>
              </li>
            ))}
          </ul>
        ) : null}

        {onClearCodes && codes.length > 0 ? (
          <button
            type="button"
            data-testid="obd-clear-codes-cta"
            disabled={!clearCodesEnabled}
            onClick={onClearCodes}
            className="mt-4 inline-flex min-h-[48px] w-full items-center justify-center rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 text-base font-semibold text-amber-100 hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {clearCodesEnabled
              ? t("obd.clearCta")
              : t("obd.clearNeedConnect")}
          </button>
        ) : null}
      </div>

      {/* Emissions readiness */}
      <div className="rounded-3xl border border-slate-700 bg-[#111827] p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
            {t("obd.readinessTitle")}
          </p>
          {smog ? (
            <p
              className={`inline-flex items-center gap-1.5 text-sm font-semibold ${
                smogReady
                  ? "text-emerald-300"
                  : smog.verdict === "unknown"
                    ? "text-slate-300"
                    : "text-amber-200"
              }`}
            >
              {smogReady ? (
                <CheckCircle2 className="h-5 w-5" aria-hidden />
              ) : (
                <CircleDashed className="h-5 w-5" aria-hidden />
              )}
              {smogReady
                ? t("obd.smogReadyShort")
                : t(`obd.smog_${smog.verdict}`, {
                    count: smog.incomplete.length,
                  })}
            </p>
          ) : null}
        </div>

        {monitors.length > 0 ? (
          <ul className="grid grid-cols-2 gap-3">
            {monitors.map((m) => {
              const Icon = MONITOR_ICON[m.id] ?? Gauge;
              return (
                <li
                  key={m.id}
                  className="flex items-start gap-3 rounded-2xl border border-slate-800 bg-black/30 px-3 py-3"
                >
                  <span
                    className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                      m.ready
                        ? "bg-emerald-500/15 text-emerald-300"
                        : "bg-amber-500/15 text-amber-300"
                    }`}
                    aria-hidden
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold leading-snug text-white">
                      {m.label}
                    </p>
                    <p
                      className={`mt-0.5 text-sm font-medium ${
                        m.ready ? "text-emerald-400" : "text-amber-300"
                      }`}
                    >
                      {m.ready
                        ? t("obd.monitorReady")
                        : t("obd.monitorIncomplete")}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="rounded-2xl border border-dashed border-slate-700 px-4 py-5 text-center text-base text-slate-400">
            {t("obd.readinessEmpty")}
          </p>
        )}
      </div>

      {/* Live sensors */}
      <div className="rounded-3xl border border-slate-700 bg-[#111827] p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
            {t("obd.sensorsTitle")}
          </p>
          <p className="inline-flex items-center gap-1.5 text-sm text-slate-400">
            {isRefreshing
              ? t("obd.sensorsUpdating")
              : live
                ? t("obd.sensorsLive")
                : t("obd.sensorsIdle")}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {primarySensors.map(({ key, label, unit }) => {
            const Icon = SENSOR_ICON[key] ?? Activity;
            const value = formatLiveSensorValue(
              sensors?.[key] ?? null,
              unit,
              unitSystem,
            );
            return (
              <div
                key={key}
                className="rounded-2xl border border-slate-800 bg-black/35 p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-slate-400">{label}</p>
                  <Icon
                    className="h-6 w-6 text-cyan-400"
                    aria-hidden
                    strokeWidth={2.25}
                  />
                </div>
                <p className="mt-3 font-mono text-3xl font-bold tracking-tight text-cyan-300 sm:text-4xl">
                  {value}
                </p>
                <p className="mt-3 inline-flex items-center gap-1.5 text-sm text-emerald-400">
                  <span
                    className={`h-2 w-2 rounded-full ${live ? "bg-emerald-400" : "bg-slate-600"}`}
                    aria-hidden
                  />
                  {live ? t("obd.sensorsLive") : "—"}
                </p>
              </div>
            );
          })}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {extraSensors.map(({ key, label, unit }) => {
            const Icon = SENSOR_ICON[key] ?? Activity;
            return (
              <div
                key={key}
                className="rounded-2xl border border-slate-800/80 bg-slate-950/50 px-3 py-3"
              >
                <div className="flex items-center gap-1.5 text-slate-400">
                  <Icon className="h-4 w-4 shrink-0 text-cyan-400/80" />
                  <span className="truncate text-xs font-medium sm:text-sm">
                    {label}
                  </span>
                </div>
                <p className="mt-1.5 font-mono text-xl font-semibold text-white">
                  {formatLiveSensorValue(
                    sensors?.[key] ?? null,
                    unit,
                    unitSystem,
                  )}
                </p>
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {onRefreshSensors ? (
            <button
              type="button"
              data-testid={refreshTestId}
              data-obd-action={refreshObdAction}
              onClick={onRefreshSensors}
              disabled={isRefreshing}
              className="inline-flex min-h-[48px] flex-1 items-center justify-center rounded-2xl border border-cyan-500/40 bg-cyan-500/10 px-4 text-base font-semibold text-cyan-100 hover:bg-cyan-500/20 disabled:opacity-40 sm:flex-none"
            >
              {isRefreshing
                ? t("obd.refreshSensorsReading")
                : refreshLabel || t("obd.refreshSensors")}
            </button>
          ) : null}
          {showConnectCta && onConnect ? (
            <button
              type="button"
              onClick={onConnect}
              className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 text-base font-semibold text-white hover:bg-emerald-500 sm:flex-none"
            >
              <Bluetooth className="h-5 w-5" />
              {t("obd.connectEntry")}
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
