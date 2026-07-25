"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { InventoryCategory, InventoryItem } from "@/lib/types/parts";
import { INVENTORY_CATEGORY_LABELS } from "@/lib/types/parts";
import type { VehicleInfo } from "@/lib/types/chat";
import { buildPurchaseChannels } from "@/lib/purchase-links";
import { channelsToPurchaseLinks } from "@/lib/types/parts";

interface Props {
  open: boolean;
  vehicle: VehicleInfo;
  initial?: Partial<InventoryItem> | null;
  onClose: () => void;
  onSave: (item: InventoryItem) => void | Promise<void>;
}

const CATEGORIES = Object.keys(
  INVENTORY_CATEGORY_LABELS,
) as InventoryCategory[];

function emptyForm(vehicle: VehicleInfo): InventoryItem {
  return {
    id: `part_${Date.now()}`,
    vehicleId: vehicle.id,
    name: "",
    oemNumber: "",
    brand: "",
    category: "other",
    currentStock: 1,
    minStock: 1,
    price: 0,
    location: "",
    purchaseLinks: [],
    notes: "",
    lastUpdated: new Date(),
  };
}

export default function PartFormModal({
  open,
  vehicle,
  initial,
  onClose,
  onSave,
}: Props) {
  const [form, setForm] = useState<InventoryItem>(() => emptyForm(vehicle));
  const [linkInput, setLinkInput] = useState("");

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(
        initial?.id
          ? { ...emptyForm(vehicle), ...initial, vehicleId: vehicle.id }
          : emptyForm(vehicle),
      );
      setLinkInput("");
      setSaving(false);
    }
  }, [open, initial, vehicle]);

  if (!open) return null;

  const update = (patch: Partial<InventoryItem>) =>
    setForm((prev) => ({ ...prev, ...patch }));

  const addLink = () => {
    const url = linkInput.trim();
    if (!url || form.purchaseLinks.includes(url)) return;
    update({ purchaseLinks: [...form.purchaseLinks, url] });
    setLinkInput("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || saving) return;

    let purchaseLinks = form.purchaseLinks;
    if (purchaseLinks.length === 0) {
      purchaseLinks = channelsToPurchaseLinks(
        buildPurchaseChannels(form.name, vehicle, form.oemNumber),
      );
    }

    setSaving(true);
    try {
      await onSave({
        ...form,
        purchaseLinks,
        lastUpdated: new Date(),
      });
      onClose();
    } catch {
      /* parent surfaces error */
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-slate-700 bg-[#111827] p-6">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-bold">
            {initial?.id ? "Edit Part" : "Add Part to Inventory"}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="text-slate-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block text-sm">
            <span className="text-slate-400">Part name *</span>
            <input
              required
              value={form.name}
              onChange={(e) => update({ name: e.target.value })}
              className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3"
              placeholder="e.g. Front Brake Pads, Oil Filter"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="text-slate-400">OEM part #</span>
              <input
                value={form.oemNumber}
                onChange={(e) => update({ oemNumber: e.target.value })}
                className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 font-mono text-sm"
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-400">Brand</span>
              <input
                value={form.brand}
                onChange={(e) => update({ brand: e.target.value })}
                placeholder="Bosch, Denso..."
                className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3"
              />
            </label>
          </div>

          <label className="block text-sm">
            <span className="text-slate-400">Category</span>
            <select
              value={form.category}
              onChange={(e) =>
                update({ category: e.target.value as InventoryCategory })
              }
              className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {INVENTORY_CATEGORY_LABELS[cat]}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-3 gap-3">
            <label className="block text-sm">
              <span className="text-slate-400">In stock</span>
              <input
                type="number"
                min={0}
                value={form.currentStock}
                onChange={(e) =>
                  update({ currentStock: Number(e.target.value) })
                }
                className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3"
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-400">Min stock</span>
              <input
                type="number"
                min={0}
                value={form.minStock}
                onChange={(e) => update({ minStock: Number(e.target.value) })}
                className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3"
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-400">Price ($)</span>
              <input
                type="number"
                min={0}
                step={0.01}
                value={form.price || ""}
                onChange={(e) => update({ price: Number(e.target.value) })}
                className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3"
              />
            </label>
          </div>

          <label className="block text-sm">
            <span className="text-slate-400">Location</span>
            <input
              value={form.location}
              onChange={(e) => update({ location: e.target.value })}
              placeholder="Shelf B-3, Toolbox 2"
              className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3"
            />
          </label>

          <div className="block text-sm">
            <span className="text-slate-400">Purchase links</span>
            <div className="mt-1 flex gap-2">
              <input
                value={linkInput}
                onChange={(e) => setLinkInput(e.target.value)}
                placeholder="https://..."
                className="flex-1 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm"
              />
              <button
                type="button"
                onClick={addLink}
                className="rounded-xl border border-slate-600 px-3 text-sm"
              >
                Add
              </button>
            </div>
            {form.purchaseLinks.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs text-cyan-400">
                {form.purchaseLinks.map((link) => (
                  <li key={link} className="truncate">
                    {link}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <label className="block text-sm">
            <span className="text-slate-400">Notes</span>
            <textarea
              value={form.notes}
              onChange={(e) => update({ notes: e.target.value })}
              rows={2}
              className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3"
            />
          </label>

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-xl bg-cyan-500 py-3 font-semibold text-black hover:bg-cyan-400 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save to Inventory"}
          </button>
        </form>
      </div>
    </div>
  );
}
