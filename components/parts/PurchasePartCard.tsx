"use client";

import { useState } from "react";
import { ExternalLink, PackagePlus, ShoppingCart } from "lucide-react";
import type { PartRecommendation } from "@/lib/types/parts";
import type { VehicleInfo } from "@/lib/types/chat";
import {
  recommendationToInventory,
  saveInventoryItem,
} from "@/lib/parts-storage";

interface Props {
  part: PartRecommendation;
  vehicle: VehicleInfo;
  onSaved?: () => void;
}

export default function PurchasePartCard({
  part,
  vehicle,
  onSaved,
}: Props) {
  const [showForm, setShowForm] = useState(false);
  const [currentStock, setCurrentStock] = useState(part.quantityNeeded || 1);
  const [minStock, setMinStock] = useState(
    part.category === "consumable" ? 1 : 0,
  );
  const [location, setLocation] = useState("");
  const [saved, setSaved] = useState(false);

  const handleSave = (purchased: boolean) => {
    const item = recommendationToInventory(part, vehicle, {
      currentStock: purchased ? currentStock : 0,
      minStock,
      location,
    });
    saveInventoryItem(item);
    setSaved(true);
    setShowForm(false);
    onSaved?.();
  };

  const purchaseLinks =
    part.purchaseChannels.length > 0
      ? part.purchaseChannels
      : [];

  return (
    <div className="rounded-2xl border border-slate-700 bg-[#111827] p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-lg font-semibold text-white">{part.name}</h4>
          <p className="mt-1 text-sm text-slate-400">{part.fitment}</p>
        </div>
        <p className="text-lg font-bold text-cyan-400">{part.estimatedPrice}</p>
      </div>

      <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-slate-500">OEM #</dt>
          <dd className="font-mono text-slate-200">
            {part.oemPartNumber || "—"}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Brand</dt>
          <dd className="text-slate-200">
            {part.aftermarketBrand}{" "}
            {part.aftermarketPartNumber && (
              <span className="font-mono text-slate-400">
                ({part.aftermarketPartNumber})
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Qty needed</dt>
          <dd className="text-slate-200">
            {part.quantityNeeded} {part.unit}
          </dd>
        </div>
      </dl>

      {part.notes && (
        <p className="mt-3 text-sm text-slate-400">{part.notes}</p>
      )}

      {purchaseLinks.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
            Buy from
          </p>
          <div className="flex flex-wrap gap-2">
            {purchaseLinks.map((ch) => (
              <a
                key={`${part.name}-${ch.store}`}
                href={ch.searchUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-cyan-300 hover:border-cyan-500/50"
              >
                <ShoppingCart className="h-3.5 w-3.5" />
                {ch.store}
                <ExternalLink className="h-3 w-3 opacity-60" />
              </a>
            ))}
          </div>
        </div>
      )}

      {!saved && !showForm && (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="mt-5 flex items-center gap-2 rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-black hover:bg-cyan-400"
        >
          <PackagePlus className="h-4 w-4" />
          Add to Inventory
        </button>
      )}

      {showForm && (
        <div className="mt-5 space-y-3 rounded-xl border border-slate-600 bg-slate-900/80 p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block text-sm">
              <span className="text-slate-400">In stock</span>
              <input
                type="number"
                min={0}
                value={currentStock}
                onChange={(e) => setCurrentStock(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-400">Min stock</span>
              <input
                type="number"
                min={0}
                value={minStock}
                onChange={(e) => setMinStock(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-400">Location</span>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Shelf B-3"
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2"
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => handleSave(true)}
              className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-black"
            >
              Purchased — save to stock
            </button>
            <button
              type="button"
              onClick={() => handleSave(false)}
              className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300"
            >
              Wishlist — track as needed
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 text-sm text-slate-500"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {saved && (
        <p className="mt-4 text-sm font-medium text-emerald-400">
          ✓ Saved to inventory — view in Parts Inventory tab
        </p>
      )}
    </div>
  );
}
