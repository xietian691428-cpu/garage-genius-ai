"use client";

import { useActionState, useEffect, useState } from "react";
import {
  createKnowledgeAction,
  deleteKnowledgeAction,
  updateKnowledgeAction,
  type ActionResult,
} from "@/app/admin/actions";
import type { KnowledgeEntry } from "@/lib/types/knowledge";

const initialState: ActionResult | null = null;

function KnowledgeFormFields({ entry }: { entry?: KnowledgeEntry }) {
  return (
    <div className="grid gap-3">
      {entry && <input type="hidden" name="id" value={entry.id} />}

      <label className="space-y-1">
        <span className="text-xs text-slate-500">Title *</span>
        <input
          name="title"
          required
          defaultValue={entry?.title ?? ""}
          className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-cyan-400"
        />
      </label>

      <label className="space-y-1">
        <span className="text-xs text-slate-500">Content *</span>
        <textarea
          name="content"
          required
          rows={6}
          defaultValue={entry?.content ?? ""}
          className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-cyan-400"
        />
      </label>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1">
          <span className="text-xs text-slate-500">Source</span>
          <input
            name="source"
            defaultValue={entry?.source ?? "manual"}
            className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-cyan-400"
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-slate-500">Category</span>
          <input
            name="category"
            defaultValue={entry?.category ?? "general"}
            className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-cyan-400"
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-slate-500">Vehicle Make</span>
          <input
            name="vehicle_make"
            defaultValue={entry?.vehicle_make ?? ""}
            className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-cyan-400"
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-slate-500">Vehicle Model</span>
          <input
            name="vehicle_model"
            defaultValue={entry?.vehicle_model ?? ""}
            className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-cyan-400"
          />
        </label>
        <label className="space-y-1 md:col-span-2">
          <span className="text-xs text-slate-500">Vehicle Years</span>
          <input
            name="vehicle_years"
            defaultValue={entry?.vehicle_years ?? ""}
            className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-cyan-400"
          />
        </label>
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-300">
        <input
          type="checkbox"
          name="is_active"
          defaultChecked={entry?.is_active ?? true}
          className="h-4 w-4 rounded border-slate-600"
        />
        Active
      </label>
    </div>
  );
}

function KnowledgeForm({
  entry,
  onDone,
}: {
  entry?: KnowledgeEntry;
  onDone?: () => void;
}) {
  const action = entry ? updateKnowledgeAction : createKnowledgeAction;
  const [state, formAction, pending] = useActionState(action, initialState);

  useEffect(() => {
    if (state?.ok) onDone?.();
  }, [state, onDone]);

  return (
    <form action={formAction} className="space-y-4">
      <KnowledgeFormFields entry={entry} />
      {state?.error && (
        <p className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {state.error}
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
          {pending ? "Saving…" : entry ? "Update entry" : "Add entry"}
        </button>
      </div>
    </form>
  );
}

export default function KnowledgeManager({
  entries,
}: {
  entries: KnowledgeEntry[];
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this knowledge entry?")) return;
    const result = await deleteKnowledgeAction(id);
    if (!result.ok) setError(result.error ?? "Delete failed.");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Knowledge Base</h1>
          <p className="mt-1 text-sm text-slate-400">
            Manage RAG entries. Embeddings can be generated later via seed /
            reindex.
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
          {showCreate ? "Close form" : "Add entry"}
        </button>
      </div>

      {error && (
        <p className="rounded-2xl bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </p>
      )}

      {showCreate && (
        <div className="rounded-3xl border border-slate-800 bg-[#111827] p-5">
          <KnowledgeForm onDone={() => setShowCreate(false)} />
        </div>
      )}

      <div className="space-y-3">
        {entries.length === 0 && (
          <div className="rounded-3xl border border-slate-800 bg-[#111827] px-4 py-10 text-center text-slate-500">
            No knowledge entries yet.
          </div>
        )}
        {entries.map((entry) => (
          <div
            key={entry.id}
            className="rounded-3xl border border-slate-800 bg-[#111827] p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-white">
                  {entry.title}
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  {[entry.vehicle_make, entry.vehicle_model, entry.vehicle_years]
                    .filter(Boolean)
                    .join(" · ") || "General"}{" "}
                  · {entry.category} · {entry.source}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setEditingId((id) => (id === entry.id ? null : entry.id))
                  }
                  className="rounded-lg px-2.5 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete(entry.id)}
                  className="rounded-lg px-2.5 py-1.5 text-xs text-red-300 hover:bg-red-500/10"
                >
                  Delete
                </button>
              </div>
            </div>
            <p className="mt-3 line-clamp-3 text-sm text-slate-300">
              {entry.content}
            </p>
            {editingId === entry.id && (
              <div className="mt-4 border-t border-slate-800 pt-4">
                <KnowledgeForm
                  entry={entry}
                  onDone={() => setEditingId(null)}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
