"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createAffiliatePartAction,
  deleteAffiliatePartAction,
  toggleAffiliatePartActiveAction,
  updateAffiliatePartAction,
  type ActionResult,
} from "@/app/admin/actions";
import {
  AFFILIATE_PART_CATEGORIES,
  type AffiliatePart,
} from "@/lib/types/affiliate-parts";

const initialState: ActionResult | null = null;

function PartFormFields({ part }: { part?: AffiliatePart }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {part && <input type="hidden" name="id" value={part.id} />}

      <label className="space-y-1">
        <span className="text-xs text-slate-500">OEM Number *</span>
        <input
          name="oem_number"
          required
          defaultValue={part?.oem_number ?? ""}
          className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-cyan-400"
        />
      </label>

      <label className="space-y-1">
        <span className="text-xs text-slate-500">Name *</span>
        <input
          name="name"
          required
          defaultValue={part?.name ?? ""}
          className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-cyan-400"
        />
      </label>

      <label className="space-y-1">
        <span className="text-xs text-slate-500">Brand *</span>
        <input
          name="brand"
          required
          defaultValue={part?.brand ?? ""}
          className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-cyan-400"
        />
      </label>

      <label className="space-y-1">
        <span className="text-xs text-slate-500">Category</span>
        <select
          name="category"
          defaultValue={part?.category ?? "other"}
          className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-cyan-400"
        >
          {AFFILIATE_PART_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>

      <label className="space-y-1">
        <span className="text-xs text-slate-500">Vehicle Make</span>
        <input
          name="vehicle_make"
          defaultValue={part?.vehicle_make ?? ""}
          placeholder="Toyota"
          className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-cyan-400"
        />
      </label>

      <label className="space-y-1">
        <span className="text-xs text-slate-500">Vehicle Model</span>
        <input
          name="vehicle_model"
          defaultValue={part?.vehicle_model ?? ""}
          placeholder="Camry"
          className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-cyan-400"
        />
      </label>

      <label className="space-y-1">
        <span className="text-xs text-slate-500">Vehicle Years</span>
        <input
          name="vehicle_years"
          defaultValue={part?.vehicle_years ?? ""}
          placeholder="2018-2024"
          className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-cyan-400"
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1">
          <span className="text-xs text-slate-500">Price Min (USD)</span>
          <input
            name="price_min"
            type="number"
            step="0.01"
            defaultValue={part?.price_min ?? ""}
            className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-cyan-400"
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-slate-500">Price Max (USD)</span>
          <input
            name="price_max"
            type="number"
            step="0.01"
            defaultValue={part?.price_max ?? ""}
            className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-cyan-400"
          />
        </label>
      </div>

      <label className="space-y-1 md:col-span-2">
        <span className="text-xs text-slate-500">Amazon URL</span>
        <input
          name="amazon_url"
          type="url"
          defaultValue={part?.amazon_url ?? ""}
          className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-cyan-400"
        />
      </label>

      <label className="space-y-1 md:col-span-2">
        <span className="text-xs text-slate-500">RockAuto URL</span>
        <input
          name="rockauto_url"
          type="url"
          defaultValue={part?.rockauto_url ?? ""}
          className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-cyan-400"
        />
      </label>

      <label className="space-y-1">
        <span className="text-xs text-slate-500">AutoZone URL</span>
        <input
          name="autozone_url"
          type="url"
          defaultValue={part?.autozone_url ?? ""}
          className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-cyan-400"
        />
      </label>

      <label className="space-y-1">
        <span className="text-xs text-slate-500">O&apos;Reilly URL</span>
        <input
          name="oreilly_url"
          type="url"
          defaultValue={part?.oreilly_url ?? ""}
          className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-cyan-400"
        />
      </label>

      <label className="space-y-1 md:col-span-2">
        <span className="text-xs text-slate-500">
          Other URLs (comma or newline separated)
        </span>
        <textarea
          name="other_urls"
          rows={2}
          defaultValue={(part?.other_urls ?? []).join("\n")}
          className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-cyan-400"
        />
      </label>

      <label className="space-y-1 md:col-span-2">
        <span className="text-xs text-slate-500">Notes</span>
        <textarea
          name="notes"
          rows={2}
          defaultValue={part?.notes ?? ""}
          className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-cyan-400"
        />
      </label>

      <label className="flex items-center gap-2 text-sm text-slate-300 md:col-span-2">
        <input
          type="checkbox"
          name="is_active"
          defaultChecked={part?.is_active ?? true}
          className="h-4 w-4 rounded border-slate-600"
        />
        Active (visible for recommendations)
      </label>
    </div>
  );
}

function PartForm({
  part,
  onDone,
}: {
  part?: AffiliatePart;
  onDone?: () => void;
}) {
  const action = part ? updateAffiliatePartAction : createAffiliatePartAction;
  const [state, formAction, pending] = useActionState(action, initialState);

  useEffect(() => {
    if (state?.ok) onDone?.();
  }, [state, onDone]);

  return (
    <form action={formAction} className="space-y-4">
      <PartFormFields part={part} />
      {state?.error && (
        <p className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p className="rounded-xl bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
          Saved.
        </p>
      )}
      <div className="flex justify-end gap-2">
        {onDone && (
          <button
            type="button"
            onClick={onDone}
            className="rounded-xl px-4 py-2 text-sm text-slate-400 hover:bg-slate-800"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-black hover:bg-cyan-400 disabled:opacity-60"
        >
          {pending ? "Saving…" : part ? "Update part" : "Add part"}
        </button>
      </div>
    </form>
  );
}

function formatPrice(part: AffiliatePart) {
  if (part.price_min == null && part.price_max == null) return "—";
  if (part.price_min != null && part.price_max != null) {
    return `$${part.price_min}–$${part.price_max}`;
  }
  return `$${part.price_min ?? part.price_max}`;
}

function linkCount(part: AffiliatePart) {
  return [
    part.amazon_url,
    part.rockauto_url,
    part.autozone_url,
    part.oreilly_url,
    ...(part.other_urls ?? []),
  ].filter(Boolean).length;
}

export default function PartsManager({ parts }: { parts: AffiliatePart[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<AffiliatePart[]>(parts);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRows(parts);
  }, [parts]);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this affiliate part?")) return;
    setBusyId(id);
    setError(null);
    const result = await deleteAffiliatePartAction(id);
    if (!result.ok) {
      setError(result.error ?? "Delete failed.");
    } else {
      setRows((prev) => prev.filter((p) => p.id !== id));
      router.refresh();
    }
    setBusyId(null);
  };

  const handleToggle = async (part: AffiliatePart) => {
    setBusyId(part.id);
    setError(null);
    const nextActive = !part.is_active;
    const result = await toggleAffiliatePartActiveAction(part.id, nextActive);
    if (!result.ok) {
      setError(result.error ?? "Update failed.");
    } else {
      setRows((prev) =>
        prev.map((p) =>
          p.id === part.id ? { ...p, is_active: nextActive } : p,
        ),
      );
      router.refresh();
    }
    setBusyId(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Affiliate Parts</h1>
          <p className="mt-1 text-sm text-slate-400">
            Manage OEM numbers and purchase links used in AI recommendations.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setShowCreate((v) => !v);
            setEditingId(null);
          }}
          className="rounded-2xl bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-black hover:bg-cyan-400"
        >
          {showCreate ? "Close form" : "Add part"}
        </button>
      </div>

      {error && (
        <p className="rounded-2xl bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </p>
      )}

      {showCreate && (
        <div className="rounded-3xl border border-slate-800 bg-[#111827] p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">
            New affiliate part
          </h2>
          <PartForm
            onDone={() => {
              setShowCreate(false);
              router.refresh();
            }}
          />
        </div>
      )}

      <div className="overflow-hidden rounded-3xl border border-slate-800 bg-[#111827]">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-800 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">OEM / Name</th>
                <th className="px-4 py-3">Fitment</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3">Links</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-10 text-center text-slate-500"
                  >
                    No affiliate parts yet. Add your first OEM + purchase links.
                  </td>
                </tr>
              )}
              {rows.map((part) => (
                <tr key={part.id} className="border-b border-slate-800/80">
                  <td className="px-4 py-3 align-top">
                    <p className="font-medium text-white">{part.name}</p>
                    <p className="font-mono text-xs text-cyan-400">
                      {part.oem_number}
                    </p>
                    <p className="text-xs text-slate-500">
                      {part.brand} · {part.category}
                    </p>
                  </td>
                  <td className="px-4 py-3 align-top text-slate-300">
                    {[part.vehicle_make, part.vehicle_model]
                      .filter(Boolean)
                      .join(" ") || "—"}
                    {part.vehicle_years ? (
                      <span className="block text-xs text-slate-500">
                        {part.vehicle_years}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 align-top text-slate-300">
                    {formatPrice(part)}
                  </td>
                  <td className="px-4 py-3 align-top text-slate-300">
                    {linkCount(part)}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                        part.is_active
                          ? "bg-emerald-500/15 text-emerald-300"
                          : "bg-slate-700/60 text-slate-400"
                      }`}
                    >
                      {part.is_active ? "Active" : "Off"}
                    </span>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        disabled={busyId === part.id}
                        onClick={() =>
                          setEditingId((id) =>
                            id === part.id ? null : part.id,
                          )
                        }
                        className="rounded-lg px-2.5 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={busyId === part.id}
                        onClick={() => void handleToggle(part)}
                        className="rounded-lg px-2.5 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
                      >
                        {part.is_active ? "Disable" : "Enable"}
                      </button>
                      <button
                        type="button"
                        disabled={busyId === part.id}
                        onClick={() => void handleDelete(part.id)}
                        className="rounded-lg px-2.5 py-1.5 text-xs text-red-300 hover:bg-red-500/10"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editingId && (
        <div className="rounded-3xl border border-slate-800 bg-[#111827] p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">
            Edit part
          </h2>
          <PartForm
            part={rows.find((p) => p.id === editingId)}
            onDone={() => {
              setEditingId(null);
              router.refresh();
            }}
          />
        </div>
      )}
    </div>
  );
}
