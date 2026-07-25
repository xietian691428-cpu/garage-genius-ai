"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, PackagePlus } from "lucide-react";
import type { PartRecommendation } from "@/lib/types/parts";
import type { VehicleInfo } from "@/lib/types/chat";
import { addRecommendationsToInventory } from "@/lib/parts-storage";
import PurchasePartCard from "../parts/PurchasePartCard";

interface Props {
  parts: PartRecommendation[];
  vehicle: VehicleInfo;
  onGoToInventory?: () => void;
}

export default function PartsSaveBar({
  parts,
  vehicle,
  onGoToInventory,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [savedAll, setSavedAll] = useState(false);

  if (parts.length === 0) return null;

  const handleSaveAll = () => {
    addRecommendationsToInventory(parts, vehicle);
    setSavedAll(true);
  };

  return (
    <div className="mt-3 rounded-2xl border border-cyan-500/30 bg-cyan-500/5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-cyan-300">
          🛒 {parts.length} part{parts.length > 1 ? "s" : ""} recommended — ready
          to buy &amp; track
        </p>
        <div className="flex flex-wrap gap-2">
          {!savedAll && (
            <button
              type="button"
              onClick={handleSaveAll}
              className="flex items-center gap-1.5 rounded-lg bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-black sm:text-sm"
            >
              <PackagePlus className="h-4 w-4" />
              Save all to inventory
            </button>
          )}
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-300 sm:text-sm"
          >
            {expanded ? (
              <>
                Hide <ChevronUp className="h-4 w-4" />
              </>
            ) : (
              <>
                Details <ChevronDown className="h-4 w-4" />
              </>
            )}
          </button>
        </div>
      </div>

      {savedAll && (
        <p className="mt-2 text-sm text-emerald-400">
          ✓ Added to inventory.
          {onGoToInventory && (
            <button
              type="button"
              onClick={onGoToInventory}
              className="ml-2 underline hover:text-emerald-300"
            >
              View inventory
            </button>
          )}
        </p>
      )}

      {expanded && (
        <div className="mt-4 space-y-4">
          {parts.map((part) => (
            <PurchasePartCard
              key={`${part.name}-${part.oemPartNumber}`}
              part={part}
              vehicle={vehicle}
            />
          ))}
        </div>
      )}
    </div>
  );
}
