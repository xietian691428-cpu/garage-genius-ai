"use client";

import { useCallback, useEffect, useState } from "react";
import type { MissFeedbackRecord } from "@/lib/pilot/miss-feedback";

type ListResponse = {
  items?: MissFeedbackRecord[];
  error?: string;
};

export default function MissFeedbackPanel() {
  const [status, setStatus] = useState("pending");
  const [items, setItems] = useState<MissFeedbackRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<MissFeedbackRecord | null>(null);
  const [sampleGood, setSampleGood] = useState("");
  const [draftJson, setDraftJson] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/miss-feedback?status=${encodeURIComponent(status)}&limit=50`,
      );
      const data = (await res.json()) as ListResponse;
      if (!res.ok) throw new Error(data.error || "load failed");
      setItems(data.items || []);
      if (data.error === "table_missing") {
        setError("Run migration 064_miss_feedback_queue.sql");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (action: "dismiss" | "reviewed" | "promote_draft") => {
    if (!active?.id) return;
    setBusy(true);
    setDraftJson(null);
    try {
      const res = await fetch("/api/admin/miss-feedback", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: active.id,
          action,
          sampleGood: sampleGood || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "action failed");
      if (data.draft) {
        setDraftJson(JSON.stringify(data.draft, null, 2));
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">生产错题回流</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">
            脱敏后的 Chat 失败样本。可导出黄金案例草稿；合并进{" "}
            <code className="text-cyan-300">gold-cases.json</code>{" "}
            需人工确认，不会自动改规则。
          </p>
        </div>
        <label className="text-sm text-slate-400">
          Status{" "}
          <select
            className="ml-2 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-slate-200"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="pending">pending</option>
            <option value="reviewed">reviewed</option>
            <option value="promoted_draft">promoted_draft</option>
            <option value="dismissed">dismissed</option>
            <option value="all">all</option>
          </select>
        </label>
      </div>

      {error ? (
        <p className="rounded-xl border border-amber-800/60 bg-amber-950/40 px-3 py-2 text-sm text-amber-200">
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-800 bg-slate-950/50">
          {loading ? (
            <p className="p-4 text-sm text-slate-500">Loading…</p>
          ) : items.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">No items.</p>
          ) : (
            <ul className="divide-y divide-slate-800">
              {items.map((it) => (
                <li key={it.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setActive(it);
                      setDraftJson(
                        it.goldDraft
                          ? JSON.stringify(it.goldDraft, null, 2)
                          : null,
                      );
                      setSampleGood("");
                    }}
                    className={`w-full px-4 py-3 text-left text-sm transition-colors hover:bg-slate-900 ${
                      active?.id === it.id ? "bg-slate-900" : ""
                    }`}
                  >
                    <div className="flex flex-wrap gap-1">
                      {it.dimensions.map((d) => (
                        <span
                          key={d}
                          className="rounded-md bg-slate-800 px-1.5 py-0.5 text-[11px] text-cyan-300"
                        >
                          {d}
                        </span>
                      ))}
                      <span className="text-[11px] text-rose-300">
                        {it.severity}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-slate-300">
                      {it.intentSnippet}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      {it.vehicleYmm || "—"} · {it.createdAt?.slice(0, 19)}
                      {it.gatesRepaired ? " · gates repaired" : ""}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
          {!active ? (
            <p className="text-sm text-slate-500">Select a miss sample.</p>
          ) : (
            <div className="space-y-3 text-sm">
              <p className="text-slate-400">
                Intent (desensitized)
              </p>
              <p className="rounded-lg bg-slate-900 p-2 text-slate-200">
                {active.intentSnippet}
              </p>
              <p className="text-slate-400">Reply digest</p>
              <p className="rounded-lg bg-slate-900 p-2 text-slate-200">
                {active.replyDigest}
              </p>
              <p className="text-xs text-slate-500">
                diy={active.diyPathHint || "—"} · intent=
                {active.manualIntentHint || "—"} · stop=
                {active.stopRuleIds.join(",") || "—"} · garage=
                {active.hadGarageFluids ? "yes" : "no"} · v=
                {active.appVersion || "—"} · goldCat=
                {active.goldCatalogVersion ?? "—"}
              </p>
              <label className="block text-slate-400">
                sample_good (required before merge to CI)
                <textarea
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 p-2 text-slate-200"
                  rows={3}
                  value={sampleGood}
                  onChange={(e) => setSampleGood(e.target.value)}
                  placeholder="Write a safe educational sample_good…"
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void act("promote_draft")}
                  className="rounded-xl bg-cyan-600 px-3 py-1.5 text-sm font-medium text-black disabled:opacity-50"
                >
                  Export gold draft
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void act("reviewed")}
                  className="rounded-xl border border-slate-600 px-3 py-1.5 text-slate-200"
                >
                  Mark reviewed
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void act("dismiss")}
                  className="rounded-xl border border-slate-700 px-3 py-1.5 text-slate-400"
                >
                  Dismiss
                </button>
              </div>
              {draftJson ? (
                <pre className="max-h-80 overflow-auto rounded-xl bg-black/60 p-3 text-[11px] text-emerald-200">
                  {draftJson}
                </pre>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
