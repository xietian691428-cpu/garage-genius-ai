"use client";

import { useState } from "react";
import { Check, ExternalLink, Package, Plus } from "lucide-react";
import type { VehicleInfo } from "@/lib/types/chat";
import {
  formatPartsPrice,
  saveOnePartToInventory,
  savePartsToInventory,
  storeLabelFromUrl,
  type PartsDataItem,
} from "@/lib/utils/parts";

type Props = {
  parts: PartsDataItem[];
  vehicle?: VehicleInfo | null;
  onGoToInventory?: () => void;
  title?: string;
};

export default function PartsRecommendationTable({
  parts,
  vehicle,
  onGoToInventory,
  title,
}: Props) {
  const [savingAll, setSavingAll] = useState(false);
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!parts.length) return null;

  const rowKey = (p: PartsDataItem, i: number) =>
    `${p.oemNumber || p.name}-${i}`;

  const handleSaveAll = async () => {
    if (!vehicle?.id) {
      setError("Vehicle required to save inventory.");
      return;
    }
    setSavingAll(true);
    setError(null);
    setMessage(null);
    const result = await savePartsToInventory(parts, vehicle.id);
    setSavingAll(false);
    if (!result.ok) {
      setError(result.error || "Save failed");
      return;
    }
    setSavedKeys(new Set(parts.map((p, i) => rowKey(p, i))));
    setMessage(`Saved ${parts.length} part(s) to inventory.`);
    onGoToInventory?.();
  };

  const handleSaveOne = async (part: PartsDataItem, index: number) => {
    if (!vehicle?.id) {
      setError("Vehicle required to save inventory.");
      return;
    }
    setError(null);
    const key = rowKey(part, index);
    const result = await saveOnePartToInventory(part, vehicle.id);
    if (!result.ok) {
      setError(result.error || "Save failed");
      return;
    }
    setSavedKeys((prev) => new Set(prev).add(key));
    setMessage(`Saved “${part.name}” to inventory.`);
  };

  const catalogCount = parts.filter((p) => p.source === "affiliate").length;

  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-cyan-400/30 bg-slate-900/80">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700/80 px-4 py-3">
        <div className="flex items-center gap-2 font-medium text-cyan-300">
          <Package className="h-5 w-5 shrink-0" />
          <span>
            {title ||
              `${parts.length} part${parts.length === 1 ? "" : "s"} recommended`}
          </span>
          {catalogCount > 0 && (
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-300">
              {catalogCount} catalog
            </span>
          )}
        </div>
        <button
          type="button"
          disabled={savingAll || !vehicle?.id}
          onClick={() => void handleSaveAll()}
          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" />
          {savingAll ? "Saving…" : "Add all to inventory"}
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead className="bg-slate-950/60 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Part</th>
              <th className="px-3 py-2 font-medium">OEM</th>
              <th className="px-3 py-2 font-medium">Brand</th>
              <th className="px-3 py-2 font-medium">Price</th>
              <th className="px-3 py-2 font-medium">Links</th>
              <th className="px-3 py-2 font-medium"> </th>
            </tr>
          </thead>
          <tbody>
            {parts.map((part, i) => {
              const key = rowKey(part, i);
              const saved = savedKeys.has(key);
              const links = part.purchaseLinks || [];
              return (
                <tr
                  key={key}
                  className="border-t border-slate-800 align-top text-slate-200"
                >
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-white">{part.name}</div>
                    {part.source === "affiliate" && (
                      <div className="mt-0.5 text-[10px] text-emerald-400">
                        Affiliate catalog
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs text-slate-300">
                    {part.oemNumber || "—"}
                  </td>
                  <td className="px-3 py-2.5 text-slate-300">
                    {part.brand || "—"}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums text-cyan-200">
                    {formatPartsPrice(part.price)}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1.5">
                      {links.length === 0 ? (
                        <span className="text-xs text-slate-500">—</span>
                      ) : (
                        links.map((url) => (
                          <a
                            key={url}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-lg bg-slate-800 px-2 py-1 text-[11px] text-cyan-300 hover:bg-slate-700"
                          >
                            {storeLabelFromUrl(url)}
                            <ExternalLink className="h-3 w-3 opacity-70" />
                          </a>
                        ))
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <button
                      type="button"
                      disabled={saved || !vehicle?.id}
                      onClick={() => void handleSaveOne(part, i)}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-600 px-2 py-1.5 text-[11px] font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-50"
                    >
                      {saved ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-emerald-400" />
                          Saved
                        </>
                      ) : (
                        <>
                          <Plus className="h-3.5 w-3.5" />
                          Add
                        </>
                      )}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {(message || error) && (
        <div
          className={`border-t px-4 py-2 text-xs ${
            error
              ? "border-red-500/30 bg-red-500/10 text-red-200"
              : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
          }`}
        >
          {error || message}
        </div>
      )}
    </div>
  );
}
