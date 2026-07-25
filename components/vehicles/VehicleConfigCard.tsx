"use client";

import { BadgeCheck } from "lucide-react";
import type { VehicleInfo } from "@/lib/types/chat";
import type { VcdbResolvedConfig } from "@/lib/types/vcdb";
import type { VehicleMarketCode } from "@/lib/types/vehicle-market";
import { vehicleMarketLabel } from "@/lib/types/vehicle-market";
import {
  humanizeBrakes,
  resolveFluidFields,
  vehicleIdentityLine,
} from "@/lib/vcdb/format";

type CardSource = {
  year: number;
  make: string;
  model: string;
  submodel?: string | null;
  market?: VehicleMarketCode | string | null;
  engine?: string | null;
  transmission?: string | null;
  driveType?: string | null;
  brakes?: string | null;
  fuelGrade?: string | null;
  oilCapacity?: string | null;
  oilViscosity?: string | null;
  vcdb?: VcdbResolvedConfig | null;
  mileage?: number;
};

interface Props {
  vehicle?: VehicleInfo | null;
  config?: CardSource | null;
  compact?: boolean;
  className?: string;
}

function resolve(props: Props): CardSource | null {
  if (props.config) return props.config;
  if (props.vehicle) return props.vehicle;
  return null;
}

function VcdbVerifiedBadge({ compact }: { compact?: boolean }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/15 font-semibold text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.15)] ${
        compact ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-[11px]"
      }`}
      title="Configuration matched against the AutoCare VCdb vehicle database"
      aria-label="VCdb Verified"
    >
      <BadgeCheck
        className={compact ? "h-3 w-3" : "h-3.5 w-3.5"}
        aria-hidden
      />
      VCdb Verified
    </span>
  );
}

/** RockAuto-style full configuration card */
export default function VehicleConfigCard({
  vehicle,
  config,
  compact,
  className = "",
}: Props) {
  const src = resolve({ vehicle, config });
  if (!src?.make || !src?.model) return null;

  const identity = vehicleIdentityLine({
    year: src.year,
    make: src.make,
    model: src.model,
    submodel: src.submodel ?? undefined,
    vcdb: src.vcdb ?? undefined,
  });

  const verified = src.vcdb?.source === "vcdb";
  const fluids = resolveFluidFields(src);

  /** Engine line with inline fuel/oil when known — easy for DIY users to scan */
  const engineDisplay = (() => {
    const base = src.engine || "—";
    if (!fluids.fuelGrade && !fluids.oilLine) return base;
    const bits = [
      fluids.fuelGrade ? fluids.fuelGrade.replace(/\s*\(AKI\)\s*/i, "").trim() : null,
      fluids.oilCapacity
        ? fluids.oilViscosity
          ? `${fluids.oilCapacity.replace(/\s*with filter/i, "").trim()} ${fluids.oilViscosity}`
          : fluids.oilCapacity
        : null,
    ].filter(Boolean);
    return bits.length ? `${base} · ${bits.join(" · ")}` : base;
  })();

  const rows: { label: string; value: string; hint?: string }[] = [];

  if (src.market) {
    rows.push({
      label: "Market",
      value: `${src.market} · ${vehicleMarketLabel(src.market)}`,
    });
  }

  rows.push({ label: "Engine", value: engineDisplay });

  if (fluids.fuelGrade) {
    rows.push({ label: "Fuel", value: fluids.fuelGrade });
  }
  if (fluids.oilLine) {
    rows.push({
      label: "Engine oil",
      value: fluids.oilLine,
      hint: "Confirm fill volume in owner's manual",
    });
  }

  rows.push(
    { label: "Transmission", value: src.transmission || "—" },
    { label: "Drive", value: src.driveType || "—" },
    { label: "Brakes", value: humanizeBrakes(src.brakes) },
  );

  if (src.mileage != null && src.mileage > 0) {
    rows.push({
      label: "Mileage",
      value: `${Number(src.mileage).toLocaleString()} mi`,
    });
  }

  return (
    <div
      className={`rounded-2xl border bg-gradient-to-br from-slate-900 to-slate-950 ${
        verified ? "border-emerald-600/35" : "border-cyan-700/40"
      } ${compact ? "p-3" : "p-4"} ${className}`}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-400">
            Vehicle configuration
          </p>
          <h4
            className={`font-semibold text-white ${compact ? "text-sm" : "text-base"}`}
          >
            {identity}
          </h4>
        </div>
        {verified && <VcdbVerifiedBadge compact={compact} />}
      </div>

      <dl className={`grid gap-1.5 ${compact ? "text-xs" : "text-sm"}`}>
        {rows.map((row) => (
          <div
            key={row.label}
            className="grid grid-cols-[7.5rem_1fr] gap-2 border-t border-slate-800/80 pt-1.5 first:border-t-0 first:pt-0"
          >
            <dt className="text-slate-500">{row.label}</dt>
            <dd className="text-slate-200">
              {row.value}
              {row.hint && (
                <span className="mt-0.5 block text-[10px] font-normal text-slate-500">
                  {row.hint}
                </span>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
