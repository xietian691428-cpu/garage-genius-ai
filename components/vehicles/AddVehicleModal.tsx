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

interface Props {
  open: boolean;
  onClose: () => void;
  /** Create mode */
  onAdd?: (vehicle: VehicleInfo) => void | Promise<void>;
  /** Edit mode — when set, form loads this vehicle */
  initialVehicle?: VehicleInfo | null;
  onSave?: (vehicle: VehicleInfo) => void | Promise<void>;
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
}: Props) {
  const isEdit = Boolean(initialVehicle);
  const { features } = useSubscription();
  const canEditTags = features.customProfileTags;

  const [name, setName] = useState("My Main Car");
  const [market, setMarket] = useState<VehicleMarketCode>("US");
  const [picker, setPicker] = useState<VehicleConfigPickerValue>(defaultPicker);
  const [manualMake, setManualMake] = useState("");
  const [manualModel, setManualModel] = useState("");
  const [manualEngine, setManualEngine] = useState("");
  const [profileTags, setProfileTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showTagUpgrade, setShowTagUpgrade] = useState(false);

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
    } else {
      setName("My Main Car");
      setMarket(loadPreferredMarket());
      setPicker(defaultPicker());
      setManualMake("");
      setManualModel("");
      setManualEngine("");
      setProfileTags([]);
    }
    setSaveError(null);
    setSaving(false);
  }, [open, initialVehicle]);

  if (!open) return null;

  const catalogReady = Boolean(
    picker.make &&
      picker.model &&
      picker.engine &&
      (picker.driveType || picker.transmission || picker.vcdb),
  );
  const manualReady = Boolean(manualMake.trim() && manualModel.trim());
  const canSubmit = (catalogReady || manualReady) && !saving && Boolean(market);

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
      const nextTags = Array.from(
        new Set([
          ...systemTags,
          ...(canEditTags
            ? profileTags
            : (initialVehicle?.tags || []).filter((t) =>
                (PROFILE_TAG_OPTIONS as readonly string[]).includes(t),
              )),
        ]),
      );

      const base: VehicleInfo = {
        id: initialVehicle?.id ?? crypto.randomUUID(),
        name: name.trim() || "My Main Car",
        year,
        make,
        model,
        submodel: useCatalog ? picker.submodel || undefined : undefined,
        market,
        mileage: initialVehicle?.mileage ?? 0,
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
        vin: initialVehicle?.vin,
        lastMaintenance: initialVehicle?.lastMaintenance,
        notes: initialVehicle?.notes,
        tags: nextTags,
        vcdb: useCatalog ? vcdb ?? undefined : initialVehicle?.vcdb,
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
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/80 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={isEdit ? "Edit vehicle" : "Add new vehicle"}
    >
      <div className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-[#1e2937] p-6 sm:rounded-3xl sm:p-8 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <h3 className="mb-1 text-xl font-semibold">
          {isEdit ? "Edit Vehicle" : "Add New Vehicle"}
        </h3>
        <p className="mb-5 text-sm text-slate-400">
          Market version is required — manuals and specs differ by country even
          for the same year / make / model.
        </p>

        <div className="mb-4">
          <MarketSelect
            value={market}
            onChange={(next) => {
              setMarket(next);
              savePreferredMarket(next);
            }}
          />
        </div>

        <input
          type="text"
          placeholder="Vehicle Nickname (e.g. Daily Driver)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={`${inputClass} mb-4`}
        />

        <VehicleConfigPicker value={picker} onChange={setPicker} />

        <div className="mt-4">
          <VehicleProfileTags
            value={profileTags}
            onChange={setProfileTags}
            canEdit={canEditTags}
            onLockedClick={() => setShowTagUpgrade(true)}
          />
        </div>

        {!picker.make && (
          <details className="mt-3 rounded-xl border border-slate-700/60 p-3">
            <summary className="cursor-pointer text-sm text-slate-400">
              Or enter manually
            </summary>
            <div className="mt-3 space-y-3">
              <input
                type="text"
                placeholder="Make"
                value={manualMake}
                onChange={(e) => setManualMake(e.target.value)}
                className={inputClass}
              />
              <input
                type="text"
                placeholder="Model"
                value={manualModel}
                onChange={(e) => setManualModel(e.target.value)}
                className={inputClass}
              />
              <input
                type="text"
                placeholder="Engine"
                value={manualEngine}
                onChange={(e) => setManualEngine(e.target.value)}
                className={inputClass}
              />
            </div>
          </details>
        )}

        <div className="mt-8 flex gap-4">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="min-h-[48px] flex-1 rounded-2xl border border-slate-700 disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!canSubmit}
            className="min-h-[48px] flex-1 rounded-2xl bg-blue-600 disabled:opacity-40"
          >
            {saving
              ? "Saving…"
              : isEdit
                ? "Save changes"
                : "Save to garage"}
          </button>
        </div>
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

      <UpgradeModal
        open={showTagUpgrade}
        onClose={() => setShowTagUpgrade(false)}
        reason="tags"
      />
    </div>
  );
}
