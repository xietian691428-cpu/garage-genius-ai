"use client";

import { useEffect, useState } from "react";
import { VehicleInfo } from "@/lib/types/chat";
import {
  loadPreferredMarket,
  normalizeVehicleMarket,
  savePreferredMarket,
  type VehicleMarketCode,
} from "@/lib/types/vehicle-market";
import { useBodyScrollLock } from "@/lib/hooks/useBodyScrollLock";
import { resolveVcdbConfig } from "@/lib/vcdb/client";
import MarketSelect from "./MarketSelect";
import VehicleConfigPicker, {
  type VehicleConfigPickerValue,
} from "./VehicleConfigPicker";
import VehicleProfileTags, {
  PROFILE_TAG_OPTIONS,
} from "./VehicleProfileTags";
import UpgradeModal from "@/components/ui/UpgradeModal";
import { useSubscription } from "@/hooks/useSubscription";
import {
  COMMON_INSURANCE_PROVIDERS,
  INSURANCE_COUNTRY_REGIONS,
  US_STATE_OPTIONS,
} from "@/lib/insurance-tips";
import { useTranslation } from "react-i18next";
import { supabase } from "@/lib/supabase";
import type { VpicSnapshot } from "@/lib/vehicle-data/types";
import { describeVinClientIssue } from "@/lib/vehicle-data/vin";
import { isNhtsaRecallMarket } from "@/lib/vehicle-data/recall-copy";
import {
  YMM_UNVERIFIED_TAG,
  detectVpicYmmConflict,
  tagsWithYmmUnverified,
} from "@/lib/vehicle-data/ymm-conflict";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Create mode */
  onAdd?: (vehicle: VehicleInfo) => void | Promise<void>;
  /** Edit mode — when set, form loads this vehicle */
  initialVehicle?: VehicleInfo | null;
  onSave?: (vehicle: VehicleInfo) => void | Promise<void>;
  /** Prefill from chat gate (e.g. "Corolla" mention not in garage). */
  seedHint?: { make?: string; model?: string; label?: string } | null;
}

function defaultPicker(): VehicleConfigPickerValue {
  return {
    year: new Date().getFullYear() - 5,
    make: "",
    model: "",
    submodel: "",
    engine: "",
    transmission: "",
    driveType: "",
    brakes: "",
    vcdb: null,
  };
}

function pickerFromVehicle(vehicle: VehicleInfo): VehicleConfigPickerValue {
  return {
    year: vehicle.year,
    make: vehicle.make,
    model: vehicle.model,
    submodel: vehicle.submodel || "",
    engine: vehicle.engine || "",
    transmission: vehicle.transmission || "",
    driveType: vehicle.driveType || "",
    brakes: vehicle.brakes || "",
    vcdb: vehicle.vcdb ?? null,
  };
}

/** Add / edit vehicle — Market required at top, then ACES cascade */
export default function AddVehicleModal({
  open,
  onClose,
  onAdd,
  initialVehicle,
  onSave,
  seedHint = null,
}: Props) {
  const isEdit = Boolean(initialVehicle);
  const { features } = useSubscription();
  const { t } = useTranslation();
  const canEditTags = features.customProfileTags;

  const [name, setName] = useState("My Main Car");
  const [market, setMarket] = useState<VehicleMarketCode>("US");
  const [picker, setPicker] = useState<VehicleConfigPickerValue>(defaultPicker);
  const [manualMake, setManualMake] = useState("");
  const [manualModel, setManualModel] = useState("");
  const [manualEngine, setManualEngine] = useState("");
  const [profileTags, setProfileTags] = useState<string[]>([]);
  const [countryRegion, setCountryRegion] = useState("");
  const [countryState, setCountryState] = useState("");
  const [insuranceProvider, setInsuranceProvider] = useState("");
  const [licensePlate, setLicensePlate] = useState("");
  const [vin, setVin] = useState("");
  const [mileage, setMileage] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showTagUpgrade, setShowTagUpgrade] = useState(false);
  const [decoding, setDecoding] = useState(false);
  const [decodeHint, setDecodeHint] = useState<string | null>(null);
  const [vpicSnapshot, setVpicSnapshot] = useState<VpicSnapshot | null>(null);
  const [decodeFailedHandFill, setDecodeFailedHandFill] = useState(false);

  useBodyScrollLock(open);

  useEffect(() => {
    if (!open) return;
    if (initialVehicle) {
      setName(initialVehicle.name || "My Main Car");
      setMarket(normalizeVehicleMarket(initialVehicle.market));
      setPicker(pickerFromVehicle(initialVehicle));
      setManualMake(initialVehicle.make || "");
      setManualModel(initialVehicle.model || "");
      setManualEngine(
        initialVehicle.engine && initialVehicle.engine !== "Unknown"
          ? initialVehicle.engine
          : "",
      );
      setProfileTags(
        (initialVehicle.tags || []).filter((t) =>
          (PROFILE_TAG_OPTIONS as readonly string[]).includes(t),
        ),
      );
      setCountryRegion(initialVehicle.countryRegion || "");
      setCountryState(initialVehicle.countryState || "");
      setInsuranceProvider(initialVehicle.insuranceProvider || "");
      setLicensePlate(initialVehicle.licensePlate || "");
      setVin(initialVehicle.vin || "");
      setMileage(
        initialVehicle.mileage > 0 ? String(initialVehicle.mileage) : "",
      );
      setVpicSnapshot(initialVehicle.vpicDecode ?? null);
      setDecodeFailedHandFill(Boolean(initialVehicle.ymmUnverified));
      setDecodeHint(null);
    } else {
      const hintMake = seedHint?.make?.trim() || "";
      const hintModel = seedHint?.model?.trim() || "";
      const hintLabel = seedHint?.label?.trim() || "";
      setName(
        hintLabel
          ? hintLabel
          : [hintMake, hintModel].filter(Boolean).join(" ") || "My Main Car",
      );
      setMarket(loadPreferredMarket());
      setPicker(defaultPicker());
      setManualMake(hintMake);
      setManualModel(hintModel);
      setManualEngine("");
      setProfileTags([]);
      setCountryRegion("");
      setCountryState("");
      setInsuranceProvider("");
      setLicensePlate("");
      setVin("");
      setMileage("");
      setVpicSnapshot(null);
      setDecodeFailedHandFill(false);
      setDecodeHint(null);
    }
    setSaveError(null);
    setSaving(false);
  }, [open, initialVehicle, seedHint]);

  if (!open) return null;

  const catalogReady = Boolean(
    picker.make &&
      picker.model &&
      picker.engine &&
      (picker.driveType || picker.transmission || picker.vcdb),
  );
  const manualReady = Boolean(manualMake.trim() && manualModel.trim());
  const canSubmit = (catalogReady || manualReady) && !saving && Boolean(market);
  const liveMake = catalogReady ? picker.make : manualMake.trim();
  const liveModel = catalogReady ? picker.model : manualModel.trim();
  const liveConflict = detectVpicYmmConflict({
    year: picker.year,
    make: liveMake,
    model: liveModel,
    vpicDecode: vpicSnapshot,
  });

  const handleDecodeVin = async () => {
    const cleaned = vin.trim().toUpperCase();
    setVin(cleaned);
    setDecodeHint(null);
    setDecoding(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setDecodeHint("Sign in to decode a VIN with NHTSA vPIC.");
        return;
      }
      const res = await fetch("/api/vehicles/vin-decode", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          vin: cleaned,
          vehicleId: initialVehicle?.id,
        }),
      });
      const json = (await res.json()) as {
        decode?: VpicSnapshot | null;
        error?: string;
        unavailable?: boolean;
      };
      if (res.status === 400) {
        setDecodeHint(
          json.error || "Enter a 17-character VIN (no I, O, or Q).",
        );
        return;
      }
      if (!json.decode) {
        setDecodeFailedHandFill(true);
        setDecodeHint(
          "NHTSA vPIC is unavailable. Year / make / model you already entered are kept — fill them by hand.",
        );
        return;
      }
      const d = json.decode;
      setVpicSnapshot(d);
      setDecodeFailedHandFill(false);
      if (d.year) {
        setPicker((prev) => ({ ...prev, year: d.year as number }));
      }
      if (d.make) setManualMake(d.make);
      if (d.model) setManualModel(d.model);
      if (d.engine) setManualEngine(d.engine);
      const ymm = [d.year, d.make, d.model].filter(Boolean).join(" ");
      setDecodeHint(
        ymm
          ? `NHTSA vPIC: ${ymm}${d.engine ? ` · ${d.engine}` : ""}. Confirm with the owner's manual, then save.`
          : "VIN decoded. Confirm year / make / model before saving.",
      );
    } catch {
      setDecodeFailedHandFill(true);
      setDecodeHint(
        "NHTSA vPIC is unavailable. Year / make / model you already entered are kept — fill them by hand.",
      );
    } finally {
      setDecoding(false);
    }
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;

    setSaving(true);
    setSaveError(null);

    try {
      const useCatalog = catalogReady;
      const year = picker.year;
      const make = useCatalog ? picker.make : manualMake.trim();
      const model = useCatalog ? picker.model : manualModel.trim();
      const engine =
        (useCatalog ? picker.engine : manualEngine.trim()) || "Unknown";

      let vcdb = useCatalog ? picker.vcdb : null;

      if (useCatalog && !vcdb) {
        try {
          vcdb = await resolveVcdbConfig({
            year,
            make,
            model,
            submodel: picker.submodel || null,
            engine: picker.engine || null,
            transmission: picker.transmission || null,
            driveType: picker.driveType || null,
            brakes: picker.brakes || null,
          });
        } catch {
          /* catalog offline — still save YMM + powertrain fields */
        }
      }

      savePreferredMarket(market);

      const systemTags =
        useCatalog && vcdb
          ? ["VCdb matched"]
          : (initialVehicle?.tags || []).filter(
              (t) => !(PROFILE_TAG_OPTIONS as readonly string[]).includes(t),
            );
      const nextTags = tagsWithYmmUnverified(
        Array.from(
          new Set([
            ...systemTags.filter((t) => t !== YMM_UNVERIFIED_TAG),
            ...(canEditTags
              ? profileTags
              : (initialVehicle?.tags || []).filter((t) =>
                  (PROFILE_TAG_OPTIONS as readonly string[]).includes(t),
                )),
          ]),
        ),
        decodeFailedHandFill && !vpicSnapshot,
      );

      const base: VehicleInfo = {
        id: initialVehicle?.id ?? crypto.randomUUID(),
        name: name.trim() || "My Main Car",
        year,
        make,
        model,
        submodel: useCatalog ? picker.submodel || undefined : undefined,
        market,
        mileage: Math.max(
          0,
          Number.parseInt(mileage.replace(/[^\d]/g, ""), 10) ||
            initialVehicle?.mileage ||
            0,
        ),
        engine,
        transmission: useCatalog
          ? picker.transmission || vcdb?.transmission || undefined
          : initialVehicle?.transmission,
        driveType: useCatalog
          ? picker.driveType || vcdb?.driveType || undefined
          : initialVehicle?.driveType,
        brakes: useCatalog
          ? picker.brakes || vcdb?.brakes || undefined
          : initialVehicle?.brakes,
        fuelGrade: useCatalog
          ? vcdb?.fuelGrade ?? undefined
          : initialVehicle?.fuelGrade,
        oilCapacity: useCatalog
          ? vcdb?.oilCapacity ?? undefined
          : initialVehicle?.oilCapacity,
        oilViscosity: useCatalog
          ? vcdb?.oilViscosity ?? undefined
          : initialVehicle?.oilViscosity,
        vin: vin.trim().toUpperCase() || undefined,
        vpicDecode: vpicSnapshot,
        vpicDecodedAt: vpicSnapshot?.decodedAt ?? undefined,
        licensePlate: licensePlate.trim().toUpperCase() || undefined,
        lastMaintenance: initialVehicle?.lastMaintenance,
        notes: initialVehicle?.notes,
        tags: nextTags,
        ymmUnverified: decodeFailedHandFill && !vpicSnapshot,
        vcdb: useCatalog ? vcdb ?? undefined : initialVehicle?.vcdb,
        countryRegion: countryRegion.trim() || undefined,
        countryState:
          countryRegion === "United States"
            ? countryState.trim() || undefined
            : undefined,
        insuranceProvider: insuranceProvider.trim() || undefined,
      };

      if (isEdit && onSave) {
        await onSave(base);
      } else if (onAdd) {
        await onAdd(base);
      }

      onClose();
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Could not save vehicle.",
      );
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    "w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-base text-slate-200 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/80 pt-[max(0.5rem,env(safe-area-inset-top))] sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={isEdit ? "Edit vehicle" : "Add new vehicle"}
      data-testid="add-vehicle-dialog"
    >
      <div className="flex max-h-[min(92dvh,100%)] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-[#1e2937] sm:rounded-3xl">
        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-6 sm:p-8"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
        <h3 className="mb-1 text-xl font-semibold">
          {isEdit ? "Edit Vehicle" : "Add New Vehicle"}
        </h3>
        <p className="mb-5 text-sm text-slate-400">
          Market version is required — manuals and specs differ by country even
          for the same year / make / model.
        </p>
        {liveConflict ? (
          <p
            data-testid="add-vehicle-vpic-conflict"
            className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12px] leading-snug text-amber-100"
          >
            Year / make / model ({liveConflict.garageYmm}) does not match VIN
            decode ({liveConflict.snapshotYmm}). Confirm before saving.
          </p>
        ) : decodeFailedHandFill && !vpicSnapshot ? (
          <p
            data-testid="add-vehicle-ymm-unverified"
            className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12px] leading-snug text-amber-100"
          >
            VIN decode failed. You can fill year / make / model by hand — Chat
            will treat them as unverified until you confirm.
          </p>
        ) : null}

        {!isEdit && seedHint?.label ? (
          <div
            className="mb-4 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2.5 text-sm text-cyan-100"
            data-testid="vehicle-seed-hint"
          >
            Prefill from your question:{" "}
            <span className="font-semibold">{seedHint.label}</span>
            {seedHint.make || seedHint.model ? (
              <span className="mt-1 block text-xs text-cyan-200/80">
                {[seedHint.make, seedHint.model].filter(Boolean).join(" ")} — editable
                below
              </span>
            ) : null}
          </div>
        ) : null}

        <div className="mb-4">
          <MarketSelect
            value={market}
            onChange={(next) => {
              setMarket(next);
              savePreferredMarket(next);
            }}
          />
        </div>

        {isNhtsaRecallMarket(market) ? (
          <div
            className="mb-4 rounded-2xl border border-cyan-500/35 bg-cyan-950/30 p-3"
            data-testid="vehicle-vin-us-card"
          >
            <p className="text-sm font-semibold text-cyan-100">Decode VIN</p>
            <p className="mt-0.5 text-[11px] text-cyan-200/80">
              US vehicles: paste the 17-character VIN to fill year / make / model
              / engine from NHTSA vPIC. You can always edit by hand.
            </p>
            <div className="mt-3 flex gap-2">
              <input
                type="text"
                data-testid="vehicle-vin"
                value={vin}
                onChange={(e) => {
                  setVin(e.target.value.toUpperCase().slice(0, 17));
                }}
                placeholder="17-character VIN"
                className={inputClass}
                autoComplete="off"
                spellCheck={false}
              />
              <button
                type="button"
                data-testid="vehicle-vin-decode"
                onClick={() => void handleDecodeVin()}
                disabled={decoding || vin.trim().length < 17}
                className="inline-flex shrink-0 items-center justify-center rounded-xl bg-cyan-500 px-3 text-sm font-semibold text-black disabled:opacity-40"
              >
                {decoding ? "Decoding…" : "Decode VIN"}
              </button>
            </div>
            {describeVinClientIssue(vin) ? (
              <p
                className="mt-1.5 text-[11px] text-amber-200/90"
                data-testid="vehicle-vin-check-digit"
              >
                {describeVinClientIssue(vin)?.message}
              </p>
            ) : null}
            {decodeHint ? (
              <p
                className="mt-1.5 text-[11px] text-cyan-200/90"
                data-testid="vehicle-vin-decode-hint"
              >
                {decodeHint}
              </p>
            ) : (
              <p className="mt-1.5 text-[11px] text-slate-500">
                Full VIN stays in your garage. Chat and share links use the last 8
                characters only.
              </p>
            )}
          </div>
        ) : (
          <div className="mb-4">
            <p className="mb-1.5 text-xs text-slate-400">
              VIN (optional) — decode can still fill year / make / model. Recalls
              stay regional for this market.
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                data-testid="vehicle-vin"
                value={vin}
                onChange={(e) => {
                  setVin(e.target.value.toUpperCase().slice(0, 17));
                }}
                placeholder="17-character VIN"
                className={inputClass}
                autoComplete="off"
                spellCheck={false}
              />
              <button
                type="button"
                data-testid="vehicle-vin-decode"
                onClick={() => void handleDecodeVin()}
                disabled={decoding || vin.trim().length < 17}
                className="inline-flex shrink-0 items-center justify-center rounded-xl border border-cyan-600/50 bg-cyan-950/40 px-3 text-sm text-cyan-200 disabled:opacity-40"
              >
                {decoding ? "Decoding…" : "Decode VIN"}
              </button>
            </div>
            {decodeHint ? (
              <p
                className="mt-1.5 text-[11px] text-cyan-200/90"
                data-testid="vehicle-vin-decode-hint"
              >
                {decodeHint}
              </p>
            ) : null}
          </div>
        )}

        <input
          type="text"
          placeholder="Vehicle Nickname (e.g. Daily Driver)"
          data-testid="vehicle-nickname"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={`${inputClass} mb-4`}
        />

        <input
          type="text"
          inputMode="numeric"
          placeholder="Current mileage (optional)"
          data-testid="vehicle-mileage"
          value={mileage}
          onChange={(e) => setMileage(e.target.value.replace(/[^\d]/g, "").slice(0, 7))}
          className={`${inputClass} mb-4`}
        />

        <VehicleConfigPicker value={picker} onChange={setPicker} />

        <div className="mt-4">
          <VehicleProfileTags
            value={profileTags}
            onChange={setProfileTags}
            canEdit={canEditTags}
            onLockedClick={() => setShowTagUpgrade(true)}
            hint={
              profileTags.includes("Modified")
                ? t("legal.insurance.softTipDefault")
                : undefined
            }
          />
        </div>

        <details className="mt-4 rounded-xl border border-slate-700/60 p-3">
          <summary className="cursor-pointer text-sm text-slate-300">
            Identifiers{" "}
            <span className="text-slate-500">(optional)</span>
          </summary>
          <p className="mt-2 text-xs text-slate-400">
            License plate helps shop handoff reports. Full VIN is never required
            on share links.
          </p>
          <div className="mt-3 space-y-3">
            <input
              type="text"
              data-testid="vehicle-license-plate"
              value={licensePlate}
              onChange={(e) => setLicensePlate(e.target.value.slice(0, 16))}
              placeholder="License plate"
              className={inputClass}
              autoComplete="off"
            />
          </div>
        </details>

        <details className="mt-4 rounded-xl border border-slate-700/60 p-3">
          <summary className="cursor-pointer text-sm text-slate-300">
            {t("legal.insurance.settingsTitle")}{" "}
            <span className="text-slate-500">
              ({t("legal.insurance.optional")})
            </span>
          </summary>
          <p className="mt-2 text-xs text-slate-400">
            {t("legal.insurance.settingsHint")}
          </p>
          <div className="mt-3 space-y-3">
            <select
              value={countryRegion}
              onChange={(e) => {
                setCountryRegion(e.target.value);
                if (e.target.value !== "United States") setCountryState("");
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
            {countryRegion === "United States" ? (
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
            ) : null}
            <div>
              <input
                list="vehicle-insurance-providers"
                type="text"
                value={insuranceProvider}
                onChange={(e) => setInsuranceProvider(e.target.value)}
                placeholder={t("legal.insurance.providerPlaceholder")}
                className={inputClass}
                autoComplete="off"
              />
              <datalist id="vehicle-insurance-providers">
                {COMMON_INSURANCE_PROVIDERS.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
              <p className="mt-1.5 text-[11px] text-slate-500">
                {t("legal.insurance.providerHelp")}
              </p>
            </div>
          </div>
        </details>

        {!picker.make && (
          <details className="mt-3 rounded-xl border border-slate-700/60 p-3">
            <summary className="cursor-pointer text-sm text-slate-400">
              Or enter manually
            </summary>
            <div className="mt-3 space-y-3">
              <input
                type="text"
                placeholder="Make"
                data-testid="vehicle-manual-make"
                value={manualMake}
                onChange={(e) => setManualMake(e.target.value)}
                className={inputClass}
              />
              <input
                type="text"
                placeholder="Model"
                data-testid="vehicle-manual-model"
                value={manualModel}
                onChange={(e) => setManualModel(e.target.value)}
                className={inputClass}
              />
              <input
                type="text"
                placeholder="Engine"
                data-testid="vehicle-manual-engine"
                value={manualEngine}
                onChange={(e) => setManualEngine(e.target.value)}
                className={inputClass}
              />
            </div>
          </details>
        )}

        <div className="h-2" aria-hidden />
        {saveError && (
          <p className="mt-2 text-center text-xs text-rose-400">{saveError}</p>
        )}
        {!canSubmit &&
          !saving &&
          picker.make &&
          picker.model &&
          !picker.engine && (
            <p className="mt-2 text-center text-xs text-amber-300/90">
              Select engine (and drive/transmission when listed) to save.
            </p>
          )}
        </div>
        <div className="shrink-0 border-t border-slate-700/80 bg-[#1e2937] p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="inline-flex min-h-[48px] flex-1 touch-manipulation items-center justify-center rounded-2xl border border-slate-700 disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="button"
              data-testid="vehicle-save"
              onClick={() => void handleSubmit()}
              disabled={!canSubmit}
              className="inline-flex min-h-[48px] flex-1 touch-manipulation items-center justify-center rounded-2xl bg-blue-600 disabled:opacity-40"
            >
              {saving
                ? "Saving…"
                : isEdit
                  ? "Save changes"
                  : "Save to garage"}
            </button>
          </div>
        </div>
      </div>

      <UpgradeModal
        open={showTagUpgrade}
        onClose={() => setShowTagUpgrade(false)}
        reason="tags"
      />
    </div>
  );
}
