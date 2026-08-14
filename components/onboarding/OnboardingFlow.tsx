"use client";

import { useState } from "react";
import {
  Bluetooth,
  Camera,
  Car,
  Crosshair,
  Globe2,
  MessageSquare,
  Package,
  Sparkles,
  Wrench,
} from "lucide-react";
import type { VehicleInfo } from "@/lib/types/chat";
import {
  DEFAULT_VEHICLE_MARKET,
  loadPreferredMarket,
  savePreferredMarket,
  type VehicleMarketCode,
  VEHICLE_MARKETS,
} from "@/lib/types/vehicle-market";
import { resolveVcdbConfig } from "@/lib/vcdb/client";
import MarketSelect from "@/components/vehicles/MarketSelect";
import VehicleConfigPicker, {
  type VehicleConfigPickerValue,
} from "@/components/vehicles/VehicleConfigPicker";
import VehicleProfileTags from "@/components/vehicles/VehicleProfileTags";
import UpgradeModal from "@/components/ui/UpgradeModal";
import { useSubscription } from "@/hooks/useSubscription";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import {
  DIY_SKILL_OPTIONS,
  type DiySkillLevel,
} from "@/lib/diy-skill";

type Step = "welcome" | "market" | "skill" | "obd" | "vehicle";

type Props = {
  onComplete: (vehicle: VehicleInfo) => Promise<VehicleInfo>;
};

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

const FEATURES = [
  {
    icon: Camera,
    title: "Photo diagnosis",
    body: "Snap a leak, pad, or warning light — AI reads the photo and coaches you.",
  },
  {
    icon: Crosshair,
    title: "Vehicle map Focus",
    body: "Tap a zone for checklists, or jump from chat into highlighted repair areas.",
  },
  {
    icon: MessageSquare,
    title: "Hands-free AI coach",
    body: "Ask questions while you work. Voice coaching is available on accounts that include it.",
  },
  {
    icon: Package,
    title: "Fitment-aware parts",
    body: "Recommendations match your exact year / make / model / powertrain.",
  },
] as const;

/**
 * First-run garage setup for new users with an empty cloud garage.
 * Welcome → Market → Year/Make/Model/config → save vehicle profile.
 */
export default function OnboardingFlow({ onComplete }: Props) {
  const { t } = useTranslation();
  const { features } = useSubscription();
  const { session } = useAuth();
  const [step, setStep] = useState<Step>("welcome");
  const [market, setMarket] = useState<VehicleMarketCode>(() => {
    if (typeof window === "undefined") return DEFAULT_VEHICLE_MARKET;
    return loadPreferredMarket();
  });
  const [diySkill, setDiySkill] = useState<DiySkillLevel>("beginner");
  /** null = skipped / unset; true/false = explicit choice */
  const [hasObdAdapter, setHasObdAdapter] = useState<boolean | null>(null);
  const [name, setName] = useState("Daily Driver");
  const [mileage, setMileage] = useState("");
  const [profileTags, setProfileTags] = useState<string[]>([]);
  const [picker, setPicker] = useState<VehicleConfigPickerValue>(defaultPicker);
  const [manualMake, setManualMake] = useState("");
  const [manualModel, setManualModel] = useState("");
  const [manualEngine, setManualEngine] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTagUpgrade, setShowTagUpgrade] = useState(false);

  const canEditTags = features.customProfileTags;

  const catalogReady = Boolean(
    picker.make &&
      picker.model &&
      picker.engine &&
      (picker.driveType || picker.transmission || picker.vcdb),
  );
  const manualReady = Boolean(manualMake.trim() && manualModel.trim());
  const canSubmit = (catalogReady || manualReady) && !saving;

  const handleSave = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);

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
          /* catalog offline — still save YMM */
        }
      }

      savePreferredMarket(market);

      // Persist DIY skill band (fail-open if migration not applied yet)
      if (session?.access_token) {
        try {
          await fetch("/api/diy-skill", {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ diySkill }),
          });
        } catch {
          /* non-blocking */
        }
        if (hasObdAdapter !== null) {
          try {
            await fetch("/api/obd-preference", {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${session.access_token}`,
              },
              body: JSON.stringify({ hasObdAdapter }),
            });
          } catch {
            /* non-blocking */
          }
        }
      }

      const parsedMileage = Math.max(
        0,
        Math.floor(Number(String(mileage).replace(/,/g, "")) || 0),
      );

      const baseTags = [
        ...(useCatalog && vcdb ? ["VCdb matched"] : ["Onboarding"]),
        ...(canEditTags ? profileTags : []),
      ];

      await onComplete({
        id: crypto.randomUUID(),
        name: name.trim() || "Daily Driver",
        year,
        make,
        model,
        submodel: useCatalog ? picker.submodel || undefined : undefined,
        market,
        mileage: parsedMileage,
        engine,
        transmission: useCatalog
          ? picker.transmission || vcdb?.transmission || undefined
          : undefined,
        driveType: useCatalog
          ? picker.driveType || vcdb?.driveType || undefined
          : undefined,
        brakes: useCatalog
          ? picker.brakes || vcdb?.brakes || undefined
          : undefined,
        fuelGrade: useCatalog ? vcdb?.fuelGrade ?? undefined : undefined,
        oilCapacity: useCatalog ? vcdb?.oilCapacity ?? undefined : undefined,
        oilViscosity: useCatalog ? vcdb?.oilViscosity ?? undefined : undefined,
        tags: Array.from(new Set(baseTags)),
        vcdb: useCatalog ? vcdb ?? undefined : undefined,
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not save your vehicle. Please try again.",
      );
      setSaving(false);
    }
  };

  const inputClass =
    "w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-base text-slate-200 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none";

  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto bg-[#0a0f1c]">
      <div className="mx-auto flex min-h-dvh max-w-lg flex-col px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-6">
        <div className="mb-6 flex items-center gap-2">
          {(["welcome", "market", "skill", "obd", "vehicle"] as const).map(
            (s) => {
            const order = {
              welcome: 0,
              market: 1,
              skill: 2,
              obd: 3,
              vehicle: 4,
            } as const;
            const active = order[step] >= order[s];
            const current = step === s;
            return (
              <div
                key={s}
                className={`h-1.5 flex-1 rounded-full ${
                  current
                    ? "bg-cyan-400"
                    : active
                      ? "bg-cyan-400/40"
                      : "bg-slate-700"
                }`}
              />
            );
          },
          )}
        </div>

        {step === "welcome" ? (
          <>
            <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-600">
              <Wrench className="h-7 w-7 text-white" />
            </div>
            <p className="mb-2 text-sm font-medium text-cyan-300">
              {t("onboarding.welcomeEyebrow")}
            </p>
            <h1 className="mb-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">
              {t("onboarding.welcomeTitle")}
            </h1>
            <p className="mb-8 text-base leading-relaxed text-slate-400">
              Built for US &amp; EU DIY car owners. Tell us your market and
              vehicle once — then get fitment-accurate advice, photo diagnosis,
              and step-by-step repair coaching.
            </p>

            <ul className="mb-10 space-y-4">
              {FEATURES.map(({ icon: Icon, title, body }) => (
                <li
                  key={title}
                  className="flex gap-3 rounded-2xl border border-slate-800 bg-slate-900/50 p-4"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-300">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-semibold text-white">{title}</p>
                    <p className="mt-0.5 text-sm text-slate-400">{body}</p>
                  </div>
                </li>
              ))}
            </ul>

            <button
              type="button"
              onClick={() => setStep("market")}
              className="mt-auto flex min-h-[56px] w-full items-center justify-center gap-2 rounded-2xl bg-cyan-500 text-base font-semibold text-black hover:bg-cyan-400"
            >
              <Car className="h-5 w-5" />
              {t("onboarding.setUpVehicle")}
            </button>
            <p className="mt-3 text-center text-xs text-slate-500">
              Takes about a minute · Market → Year → Make → Model
            </p>
          </>
        ) : step === "market" ? (
          <>
            <button
              type="button"
              onClick={() => setStep("welcome")}
              className="mb-4 self-start text-sm text-slate-400 hover:text-slate-200"
            >
              ← Back
            </button>
            <div className="mb-2 flex items-center gap-2 text-cyan-300">
              <Globe2 className="h-4 w-4" />
              <span className="text-sm font-medium">Step 2 of 5</span>
            </div>
            <h1 className="mb-2 text-2xl font-bold text-white sm:text-3xl">
              Where was this car sold?
            </h1>
            <p className="mb-6 text-sm leading-relaxed text-slate-400">
              The same year / make / model can differ by country — owner manuals,
              lighting, emissions, and fuel labeling (AKI vs RON) are
              market-specific. Pick the version that matches your car.
            </p>

            <div className="mb-6 grid gap-2">
              {VEHICLE_MARKETS.map((m) => {
                const selected = market === m.code;
                return (
                  <button
                    key={m.code}
                    type="button"
                    onClick={() => setMarket(m.code)}
                    className={`rounded-2xl border px-4 py-3 text-left transition ${
                      selected
                        ? "border-cyan-400/70 bg-cyan-500/10"
                        : "border-slate-800 bg-slate-900/40 hover:border-slate-600"
                    }`}
                  >
                    <p className="font-medium text-white">{m.label}</p>
                    <p className="mt-0.5 text-xs text-slate-400">{m.hint}</p>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => {
                savePreferredMarket(market);
                setStep("skill");
              }}
              className="mt-auto flex min-h-[56px] w-full items-center justify-center rounded-2xl bg-cyan-500 text-base font-semibold text-black hover:bg-cyan-400"
            >
              Continue
            </button>
          </>
        ) : step === "skill" ? (
          <>
            <button
              type="button"
              onClick={() => setStep("market")}
              className="mb-4 self-start text-sm text-slate-400 hover:text-slate-200"
            >
              ← Back
            </button>
            <div className="mb-2 flex items-center gap-2 text-cyan-300">
              <Wrench className="h-4 w-4" />
              <span className="text-sm font-medium">Step 3 of 5</span>
            </div>
            <h1 className="mb-2 text-2xl font-bold text-white sm:text-3xl">
              How handy are you under the hood?
            </h1>
            <p className="mb-6 text-sm leading-relaxed text-slate-400">
              One tap — we match coaching depth to your DIY level (not a survey).
              You can change this later in Settings.
            </p>
            <div className="mb-6 grid gap-2">
              {DIY_SKILL_OPTIONS.map((opt) => {
                const selected = diySkill === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setDiySkill(opt.value)}
                    className={`rounded-2xl border px-4 py-3 text-left transition ${
                      selected
                        ? "border-cyan-400/70 bg-cyan-500/10"
                        : "border-slate-800 bg-slate-900/40 hover:border-slate-600"
                    }`}
                  >
                    <p className="font-medium text-white">{opt.label}</p>
                    <p className="mt-0.5 text-xs text-slate-400">{opt.hint}</p>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => setStep("obd")}
              className="mt-auto flex min-h-[56px] w-full items-center justify-center rounded-2xl bg-cyan-500 text-base font-semibold text-black hover:bg-cyan-400"
            >
              Continue
            </button>
          </>
        ) : step === "obd" ? (
          <>
            <button
              type="button"
              onClick={() => setStep("skill")}
              className="mb-4 self-start text-sm text-slate-400 hover:text-slate-200"
            >
              ← Back
            </button>
            <div className="mb-2 flex items-center gap-2 text-cyan-300">
              <Bluetooth className="h-4 w-4" />
              <span className="text-sm font-medium">
                {t("onboarding.obdStepLabel")}
              </span>
            </div>
            <h1 className="mb-2 text-2xl font-bold text-white sm:text-3xl">
              {t("onboarding.obdTitle")}
            </h1>
            <p className="mb-6 text-sm leading-relaxed text-slate-400">
              {t("onboarding.obdHint")}
            </p>
            <div className="mb-4 grid gap-2">
              <button
                type="button"
                onClick={() => {
                  setHasObdAdapter(true);
                  setStep("vehicle");
                }}
                className={`rounded-2xl border px-4 py-3 text-left transition ${
                  hasObdAdapter === true
                    ? "border-cyan-400/70 bg-cyan-500/10"
                    : "border-slate-800 bg-slate-900/40 hover:border-slate-600"
                }`}
              >
                <p className="font-medium text-white">{t("obd.prefYes")}</p>
                <p className="mt-0.5 text-xs text-slate-400">
                  {t("onboarding.obdYesHint")}
                </p>
              </button>
              <button
                type="button"
                onClick={() => {
                  setHasObdAdapter(false);
                  setStep("vehicle");
                }}
                className={`rounded-2xl border px-4 py-3 text-left transition ${
                  hasObdAdapter === false
                    ? "border-cyan-400/70 bg-cyan-500/10"
                    : "border-slate-800 bg-slate-900/40 hover:border-slate-600"
                }`}
              >
                <p className="font-medium text-white">{t("obd.prefNo")}</p>
                <p className="mt-0.5 text-xs text-slate-400">
                  {t("onboarding.obdNoHint")}
                </p>
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                setHasObdAdapter(null);
                setStep("vehicle");
              }}
              className="mt-auto w-full py-3 text-sm text-slate-400 hover:text-slate-200"
            >
              {t("onboarding.obdSkip")}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setStep("obd")}
              className="mb-4 self-start text-sm text-slate-400 hover:text-slate-200"
            >
              ← Back
            </button>
            <div className="mb-2 flex items-center gap-2 text-cyan-300">
              <Sparkles className="h-4 w-4" />
              <span className="text-sm font-medium">Step 5 of 5</span>
            </div>
            <h1 className="mb-2 text-2xl font-bold text-white sm:text-3xl">
              Pick your exact vehicle
            </h1>
            <p className="mb-6 text-sm leading-relaxed text-slate-400">
              Year → Make → Model → trim &amp; powertrain. Accurate config means
              safer DIY advice and correct parts fitment.
            </p>

            <div className="mb-4">
              <MarketSelect
                value={market}
                onChange={(next) => {
                  setMarket(next);
                  savePreferredMarket(next);
                }}
                compact
              />
            </div>

            <label className="mb-4 block text-sm text-slate-400">
              Nickname
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Daily Driver, Weekend Project"
                className={`${inputClass} mt-1`}
              />
            </label>

            <label className="mb-4 block text-sm text-slate-400">
              {t("onboarding.mileageLabel")}
              <input
                type="text"
                inputMode="numeric"
                value={mileage}
                onChange={(e) => setMileage(e.target.value.replace(/[^\d,]/g, ""))}
                placeholder="e.g. 45200"
                className={`${inputClass} mt-1`}
              />
              <span className="mt-1 block text-[11px] text-slate-500">
                Used for Coach Guides personalization and service intervals.
              </span>
            </label>

            <div className="mb-4">
              <VehicleProfileTags
                label={t("onboarding.tagsLabel")}
                value={profileTags}
                onChange={setProfileTags}
                canEdit={canEditTags}
                onLockedClick={() => setShowTagUpgrade(true)}
              />
            </div>

            <VehicleConfigPicker value={picker} onChange={setPicker} />

            {!picker.make && (
              <details className="mt-3 rounded-xl border border-slate-700/60 p-3">
                <summary className="cursor-pointer text-sm text-slate-400">
                  Catalog offline? Enter manually
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

            <div className="mt-8 space-y-3">
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={!canSubmit}
                className="flex min-h-[56px] w-full items-center justify-center rounded-2xl bg-cyan-500 text-base font-semibold text-black hover:bg-cyan-400 disabled:opacity-40"
              >
                {saving ? "Saving garage profile…" : "Save vehicle & start"}
              </button>
              {error && (
                <p className="text-center text-sm text-rose-400">{error}</p>
              )}
              {!canSubmit &&
                !saving &&
                picker.make &&
                picker.model &&
                !picker.engine && (
                  <p className="text-center text-xs text-amber-300/90">
                    Select engine (and drive/transmission when listed) to
                    continue.
                  </p>
                )}
            </div>
          </>
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
