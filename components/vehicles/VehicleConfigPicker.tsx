"use client";

import { useEffect, useState } from "react";
import type { VcdbResolvedConfig } from "@/lib/types/vcdb";
import {
  fetchMakes,
  fetchModels,
  fetchOptions,
  fetchSubmodels,
  fetchVcdbStatus,
  fetchYears,
  resolveVcdbConfig,
} from "@/lib/vcdb/client";
import VehicleConfigCard from "./VehicleConfigCard";

export interface VehicleConfigPickerValue {
  year: number;
  make: string;
  model: string;
  submodel: string;
  engine: string;
  transmission: string;
  driveType: string;
  brakes: string;
  vcdb: VcdbResolvedConfig | null;
}

interface Props {
  value: VehicleConfigPickerValue;
  onChange: (next: VehicleConfigPickerValue) => void;
  disabled?: boolean;
}

const selectClass =
  "w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-base text-slate-200 focus:border-blue-500 focus:outline-none disabled:opacity-50";

function emptyOptions() {
  return {
    engines: [] as string[],
    transmissions: [] as string[],
    driveTypes: [] as string[],
    brakes: [] as string[],
  };
}

/** Cascading Year → Make → Model → SubModel → Engine/Trans/Drive/Brakes */
export default function VehicleConfigPicker({
  value,
  onChange,
  disabled,
}: Props) {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [years, setYears] = useState<number[]>([]);
  const [makes, setMakes] = useState<string[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [submodels, setSubmodels] = useState<string[]>([]);
  const [options, setOptions] = useState(emptyOptions());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const status = await fetchVcdbStatus();
        if (cancelled) return;
        setAvailable(status.available);
        setStatusMsg(status.message ?? null);
        if (!status.available) return;
        const y = await fetchYears();
        if (!cancelled) setYears(y);
      } catch (err) {
        if (!cancelled) {
          setAvailable(false);
          setStatusMsg(
            err instanceof Error ? err.message : "Could not load vehicle catalog",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!available || !value.year) return;
    let cancelled = false;
    setLoading(true);
    fetchMakes(value.year)
      .then((list) => {
        if (!cancelled) setMakes(list);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [available, value.year]);

  useEffect(() => {
    if (!available || !value.year || !value.make) {
      setModels([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchModels(value.year, value.make)
      .then((list) => {
        if (!cancelled) setModels(list);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [available, value.year, value.make]);

  useEffect(() => {
    if (!available || !value.year || !value.make || !value.model) {
      setSubmodels([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchSubmodels(value.year, value.make, value.model)
      .then((list) => {
        if (!cancelled) setSubmodels(list);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [available, value.year, value.make, value.model]);

  useEffect(() => {
    if (!available || !value.year || !value.make || !value.model) {
      setOptions(emptyOptions());
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchOptions(value.year, value.make, value.model, value.submodel || null)
      .then((opts) => {
        if (cancelled) return;
        setOptions(opts);
        // Auto-pick single options
        const patch: Partial<VehicleConfigPickerValue> = {};
        if (!value.engine && opts.engines.length === 1) {
          patch.engine = opts.engines[0];
        }
        if (!value.transmission && opts.transmissions.length === 1) {
          patch.transmission = opts.transmissions[0];
        }
        if (!value.driveType && opts.driveTypes.length === 1) {
          patch.driveType = opts.driveTypes[0];
        }
        if (!value.brakes && opts.brakes.length === 1) {
          patch.brakes = opts.brakes[0];
        }
        if (Object.keys(patch).length > 0) {
          onChange({ ...value, ...patch, vcdb: null });
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // intentionally omit onChange/value full object to avoid loops — key fields only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [available, value.year, value.make, value.model, value.submodel]);

  useEffect(() => {
    if (!available || !value.year || !value.make || !value.model) return;
    if (!value.engine && !value.transmission && !value.driveType) return;

    let cancelled = false;
    const timer = setTimeout(() => {
      resolveVcdbConfig({
        year: value.year,
        make: value.make,
        model: value.model,
        submodel: value.submodel || null,
        engine: value.engine || null,
        transmission: value.transmission || null,
        driveType: value.driveType || null,
        brakes: value.brakes || null,
      })
        .then((config) => {
          if (cancelled) return;
          if (value.vcdb?.summary === config.summary) return;
          onChange({ ...value, vcdb: config });
        })
        .catch(() => {
          /* ignore resolve errors while typing */
        });
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    available,
    value.year,
    value.make,
    value.model,
    value.submodel,
    value.engine,
    value.transmission,
    value.driveType,
    value.brakes,
  ]);

  if (available === false) {
    return (
      <div className="mb-4 rounded-xl border border-amber-700/50 bg-amber-950/30 px-4 py-3 text-sm text-amber-100">
        {statusMsg ||
          "Vehicle catalog offline — enter year / make / model / engine manually below."}
      </div>
    );
  }

  if (available === null) {
    return (
      <p className="mb-4 text-sm text-slate-400">Loading vehicle catalog…</p>
    );
  }

  const patch = (partial: Partial<VehicleConfigPickerValue>) => {
    onChange({ ...value, ...partial, vcdb: null });
  };

  const steps = [
    { key: "year", done: Boolean(value.year), label: "Year" },
    { key: "make", done: Boolean(value.make), label: "Make" },
    { key: "model", done: Boolean(value.model), label: "Model" },
    {
      key: "trim",
      done: Boolean(value.submodel) || (value.model && submodels.length === 0),
      label: "Trim",
    },
    {
      key: "power",
      done: Boolean(value.engine && value.driveType),
      label: "Powertrain",
    },
  ];

  const showCard = Boolean(value.make && value.model && value.engine);

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-cyan-400">
          ACES-style vehicle select
        </p>
        <p className="mt-0.5 text-xs text-slate-500">
          Year → Make → Model → Trim → Engine → Transmission → Drive
        </p>
        <ol className="mt-2 flex flex-wrap gap-1.5">
          {steps.map((step, i) => (
            <li
              key={step.key}
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                step.done
                  ? "bg-cyan-500/20 text-cyan-300"
                  : "bg-slate-800 text-slate-500"
              }`}
            >
              {i + 1}. {step.label}
            </li>
          ))}
        </ol>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm text-slate-400">
          Year
          <select
            className={`${selectClass} mt-1`}
            disabled={disabled || loading}
            value={value.year || ""}
            onChange={(e) =>
              patch({
                year: Number(e.target.value),
                make: "",
                model: "",
                submodel: "",
                engine: "",
                transmission: "",
                driveType: "",
                brakes: "",
              })
            }
          >
            <option value="">Select year</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm text-slate-400">
          Make
          <select
            className={`${selectClass} mt-1`}
            disabled={disabled || !value.year}
            value={value.make}
            onChange={(e) =>
              patch({
                make: e.target.value,
                model: "",
                submodel: "",
                engine: "",
                transmission: "",
                driveType: "",
                brakes: "",
              })
            }
          >
            <option value="">Select make</option>
            {makes.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block text-sm text-slate-400">
        Model
        <select
          className={`${selectClass} mt-1`}
          disabled={disabled || !value.make}
          value={value.model}
          onChange={(e) =>
            patch({
              model: e.target.value,
              submodel: "",
              engine: "",
              transmission: "",
              driveType: "",
              brakes: "",
            })
          }
        >
          <option value="">Select model</option>
          {models.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </label>

      {submodels.length > 0 && (
        <label className="block text-sm text-slate-400">
          Trim / Submodel
          <select
            className={`${selectClass} mt-1`}
            disabled={disabled || !value.model}
            value={value.submodel}
            onChange={(e) =>
              patch({
                submodel: e.target.value,
                engine: "",
                transmission: "",
                driveType: "",
                brakes: "",
              })
            }
          >
            <option value="">Any / not sure</option>
            {submodels.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      )}

      {(options.engines.length > 0 ||
        options.transmissions.length > 0 ||
        options.driveTypes.length > 0) && (
        <div className="space-y-3 rounded-xl border border-slate-700/80 bg-slate-950/40 p-3">
          {options.engines.length > 0 && (
            <label className="block text-sm text-slate-400">
              Engine
              <select
                className={`${selectClass} mt-1`}
                disabled={disabled}
                value={value.engine}
                onChange={(e) => patch({ engine: e.target.value })}
              >
                <option value="">Select engine</option>
                {options.engines.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </select>
            </label>
          )}

          {options.transmissions.length > 0 && (
            <label className="block text-sm text-slate-400">
              Transmission
              <select
                className={`${selectClass} mt-1`}
                disabled={disabled}
                value={value.transmission}
                onChange={(e) => patch({ transmission: e.target.value })}
              >
                <option value="">Select transmission</option>
                {options.transmissions.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
          )}

          {options.driveTypes.length > 0 && (
            <label className="block text-sm text-slate-400">
              Drive type
              <select
                className={`${selectClass} mt-1`}
                disabled={disabled}
                value={value.driveType}
                onChange={(e) => patch({ driveType: e.target.value })}
              >
                <option value="">Select drive</option>
                {options.driveTypes.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
          )}

          {options.brakes.length > 0 && (
            <label className="block text-sm text-slate-400">
              Brake config
              <select
                className={`${selectClass} mt-1`}
                disabled={disabled}
                value={value.brakes}
                onChange={(e) => patch({ brakes: e.target.value })}
              >
                <option value="">Select brakes</option>
                {options.brakes.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}

      {showCard && (
        <VehicleConfigCard
          config={{
            year: value.year,
            make: value.make,
            model: value.model,
            submodel: value.submodel,
            engine: value.engine,
            transmission: value.transmission,
            driveType: value.driveType,
            brakes: value.brakes,
            vcdb: value.vcdb,
          }}
        />
      )}

      {error && <p className="text-xs text-rose-400">{error}</p>}
      {loading && (
        <p className="text-xs text-slate-500">Updating configuration options…</p>
      )}
    </div>
  );
}
