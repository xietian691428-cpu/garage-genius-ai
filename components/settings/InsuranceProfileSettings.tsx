"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { VehicleInfo } from "@/lib/types/chat";
import {
  COMMON_INSURANCE_PROVIDERS,
  INSURANCE_COUNTRY_REGIONS,
  US_STATE_OPTIONS,
  type InsuranceCountryRegion,
} from "@/lib/insurance-tips";

type Props = {
  vehicle: VehicleInfo | null;
  loading?: boolean;
  onSave: (vehicle: VehicleInfo) => Promise<VehicleInfo | void>;
};

/**
 * Optional country/region + insurer on the current vehicle.
 * Settings surface — skips allowed; never used for claim adjudication.
 */
export default function InsuranceProfileSettings({
  vehicle,
  loading,
  onSave,
}: Props) {
  const { t } = useTranslation();
  const [countryRegion, setCountryRegion] = useState("");
  const [countryState, setCountryState] = useState("");
  const [insuranceProvider, setInsuranceProvider] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!vehicle) {
      setCountryRegion("");
      setCountryState("");
      setInsuranceProvider("");
      return;
    }
    setCountryRegion(vehicle.countryRegion || "");
    setCountryState(vehicle.countryState || "");
    setInsuranceProvider(vehicle.insuranceProvider || "");
    setMessage(null);
  }, [vehicle]);

  const dirty =
    Boolean(vehicle) &&
    ((countryRegion || "") !== (vehicle?.countryRegion || "") ||
      (countryState || "") !== (vehicle?.countryState || "") ||
      (insuranceProvider || "") !== (vehicle?.insuranceProvider || ""));

  async function save() {
    if (!vehicle) return;
    setSaving(true);
    setMessage(null);
    try {
      await onSave({
        ...vehicle,
        countryRegion: countryRegion.trim() || undefined,
        countryState:
          countryRegion === "United States"
            ? countryState.trim() || undefined
            : undefined,
        insuranceProvider: insuranceProvider.trim() || undefined,
      });
      setMessage(t("legal.insurance.saved"));
    } catch (err) {
      setMessage(
        err instanceof Error ? err.message : t("legal.insurance.saveFailed"),
      );
    } finally {
      setSaving(false);
    }
  }

  async function clearAll() {
    if (!vehicle) return;
    setCountryRegion("");
    setCountryState("");
    setInsuranceProvider("");
    setSaving(true);
    setMessage(null);
    try {
      await onSave({
        ...vehicle,
        countryRegion: undefined,
        countryState: undefined,
        insuranceProvider: undefined,
      });
      setMessage(t("legal.insurance.cleared"));
    } catch (err) {
      setMessage(
        err instanceof Error ? err.message : t("legal.insurance.saveFailed"),
      );
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    "w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-cyan-500";

  return (
    <section className="rounded-3xl border border-slate-800 bg-[#111827] p-5">
      <h2 className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {t("legal.insurance.settingsTitle")}
      </h2>
      <p className="mt-2 text-sm text-slate-400">
        {t("legal.insurance.settingsHint")}
      </p>

      {loading ? (
        <p className="mt-4 text-sm text-slate-500">…</p>
      ) : !vehicle ? (
        <p className="mt-4 text-sm text-slate-500">
          {t("legal.insurance.noVehicle")}
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          <p className="text-xs text-slate-500">
            {t("legal.insurance.editingVehicle", {
              name: vehicle.name || `${vehicle.year} ${vehicle.make}`,
            })}
          </p>

          <label className="block space-y-1.5">
            <span className="text-xs text-slate-500">
              {t("legal.insurance.countryLabel")}
            </span>
            <select
              value={countryRegion}
              onChange={(e) => {
                const next = e.target.value as InsuranceCountryRegion | "";
                setCountryRegion(next);
                if (next !== "United States") setCountryState("");
              }}
              className={inputClass}
            >
              <option value="">{t("legal.insurance.countrySkip")}</option>
              {INSURANCE_COUNTRY_REGIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>

          {countryRegion === "United States" ? (
            <label className="block space-y-1.5">
              <span className="text-xs text-slate-500">
                {t("legal.insurance.stateLabel")}
              </span>
              <select
                value={countryState}
                onChange={(e) => setCountryState(e.target.value)}
                className={inputClass}
              >
                <option value="">{t("legal.insurance.stateSkip")}</option>
                {US_STATE_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label className="block space-y-1.5">
            <span className="text-xs text-slate-500">
              {t("legal.insurance.providerLabel")}
            </span>
            <input
              list="insurance-provider-suggestions"
              value={insuranceProvider}
              onChange={(e) => setInsuranceProvider(e.target.value)}
              placeholder={t("legal.insurance.providerPlaceholder")}
              className={inputClass}
              autoComplete="off"
            />
            <datalist id="insurance-provider-suggestions">
              {COMMON_INSURANCE_PROVIDERS.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
            <span className="block text-[11px] text-slate-500">
              {t("legal.insurance.providerHelp")}
            </span>
          </label>

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              disabled={saving || !dirty}
              onClick={() => void save()}
              className="rounded-2xl bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-black hover:bg-cyan-400 disabled:opacity-50"
            >
              {saving ? t("legal.insurance.saving") : t("legal.insurance.save")}
            </button>
            <button
              type="button"
              disabled={
                saving ||
                (!countryRegion && !countryState && !insuranceProvider)
              }
              onClick={() => void clearAll()}
              className="rounded-2xl border border-slate-600 px-4 py-2.5 text-sm text-slate-300 hover:border-slate-500 disabled:opacity-50"
            >
              {t("legal.insurance.clear")}
            </button>
          </div>
          {message ? (
            <p className="text-xs text-slate-400">{message}</p>
          ) : null}
        </div>
      )}
    </section>
  );
}
