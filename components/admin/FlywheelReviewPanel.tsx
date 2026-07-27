"use client";

import { useCallback, useEffect, useState } from "react";
import type { FlywheelQueueItem, GoldenQaRow } from "@/lib/flywheel";

export default function FlywheelReviewPanel() {
  const [items, setItems] = useState<FlywheelQueueItem[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [golden, setGolden] = useState<GoldenQaRow[]>([]);
  const [status, setStatus] = useState<"pending" | "all" | "promoted">(
    "pending",
  );
  const [active, setActive] = useState<FlywheelQueueItem | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftQuestion, setDraftQuestion] = useState("");
  const [draftAnswer, setDraftAnswer] = useState("");
  const [draftCategory, setDraftCategory] = useState("repair");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [qRes, gRes] = await Promise.all([
        fetch(`/api/admin/flywheel?view=queue&status=${status}`, {
          credentials: "include",
        }),
        fetch("/api/admin/flywheel?view=golden&limit=30", {
          credentials: "include",
        }),
      ]);
      if (!qRes.ok) {
        const body = (await qRes.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `HTTP ${qRes.status}`);
      }
      const qData = (await qRes.json()) as {
        items: FlywheelQueueItem[];
        pendingCount: number;
      };
      setItems(qData.items);
      setPendingCount(qData.pendingCount);
      if (gRes.ok) {
        const gData = (await gRes.json()) as { golden: GoldenQaRow[] };
        setGolden(gData.golden);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  function openItem(item: FlywheelQueueItem) {
    setActive(item);
    setDraftTitle(item.draftTitle || "");
    setDraftQuestion(item.draftQuestion || "");
    setDraftAnswer(item.draftAnswer || item.note || "");
    setDraftCategory(item.draftCategory || "repair");
    setMessage(null);
  }

  async function patch(action: "save" | "reject" | "promote") {
    if (!active) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/flywheel", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: active.id,
          action,
          draftTitle,
          draftQuestion,
          draftAnswer,
          draftCategory,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        embedded?: boolean;
        knowledgeBaseId?: string;
        goldenQaId?: string;
      };
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      if (action === "promote") {
        setMessage(
          `已采纳为知识库${body.embedded ? "（含向量）" : "（仅 FTS，无 embedding）"} · kb=${body.knowledgeBaseId?.slice(0, 8)}`,
        );
      } else if (action === "reject") {
        setMessage("已拒绝");
      } else {
        setMessage("已保存草稿");
      }
      await load();
      if (action === "promote" || action === "reject") setActive(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }

  async function downloadJsonl() {
    setBusy(true);
    try {
      const res = await fetch(
        "/api/admin/flywheel?view=export&download=1&onlyUnused=1",
        { credentials: "include" },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `golden-finetune-${Date.now()}.jsonl`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage("已下载未使用过的 golden JSONL（未标记 used）");
    } catch (err) {
      setError(err instanceof Error ? err.message : "导出失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">数据飞轮 · 审核队列</h1>
          <p className="mt-1 text-sm text-slate-400">
            Coach「踩」→ 人工修正 → 采纳为知识库（RAG 即时自愈）· 导出 JSONL 供月度微调
          </p>
          <p className="mt-1 text-xs text-cyan-400/80">
            待审 {pendingCount} · 需先执行 migration 026
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(["pending", "promoted", "all"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                status === s
                  ? "bg-cyan-500/20 text-cyan-300"
                  : "bg-slate-900 text-slate-400"
              }`}
            >
              {s}
            </button>
          ))}
          <button
            type="button"
            disabled={busy}
            onClick={() => void downloadJsonl()}
            className="rounded-full bg-emerald-500/20 px-3 py-1.5 text-xs font-medium text-emerald-300"
          >
            导出 Fine-tune JSONL
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}
      {message && (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          {message}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="overflow-hidden rounded-3xl border border-slate-800 lg:col-span-2">
          <div className="border-b border-slate-800 px-4 py-3 text-sm text-slate-400">
            队列 {loading ? "…" : `(${items.length})`}
          </div>
          <ul className="max-h-[70vh] divide-y divide-slate-800/80 overflow-y-auto">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => openItem(item)}
                  className={`w-full px-4 py-3 text-left hover:bg-slate-900/60 ${
                    active?.id === item.id ? "bg-slate-900" : ""
                  }`}
                >
                  <p className="truncate text-sm font-medium text-white">
                    {item.scenarioSlug || item.sourceType} · {item.stepId || "—"}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {item.status} · {new Date(item.createdAt).toLocaleString()}
                  </p>
                  {item.note && (
                    <p className="mt-1 line-clamp-2 text-xs text-slate-400">
                      {item.note}
                    </p>
                  )}
                </button>
              </li>
            ))}
            {!loading && items.length === 0 && (
              <li className="px-4 py-8 text-center text-sm text-slate-500">
                暂无条目。Coach 步骤点「无用」后会自动入队（或跑 cron
                flywheel-enqueue）。
              </li>
            )}
          </ul>
        </div>

        <div className="rounded-3xl border border-slate-800 bg-[#111827] p-5 lg:col-span-3">
          {!active ? (
            <p className="text-sm text-slate-500">
              选择左侧条目：填写正确问答 →「采纳为知识库」即可写入 RAG。
            </p>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-slate-500">
                {active.sourceType} · vote={active.vote} ·{" "}
                {[active.vehicleMake, active.vehicleModel]
                  .filter(Boolean)
                  .join(" ") || "无车型"}
              </p>
              <label className="block text-xs text-slate-500">
                标题
                <input
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
                />
              </label>
              <label className="block text-xs text-slate-500">
                问题（用户侧）
                <textarea
                  value={draftQuestion}
                  onChange={(e) => setDraftQuestion(e.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
                />
              </label>
              <label className="block text-xs text-slate-500">
                正确答案
                <textarea
                  value={draftAnswer}
                  onChange={(e) => setDraftAnswer(e.target.value)}
                  rows={8}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
                  placeholder="写成可直接给用户的安全 DIY 指导…"
                />
              </label>
              <label className="block text-xs text-slate-500">
                分类
                <input
                  value={draftCategory}
                  onChange={(e) => setDraftCategory(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
                />
              </label>
              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void patch("save")}
                  className="rounded-xl bg-slate-800 px-4 py-2 text-sm text-slate-200"
                >
                  保存草稿
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void patch("reject")}
                  className="rounded-xl border border-rose-500/40 px-4 py-2 text-sm text-rose-300"
                >
                  拒绝
                </button>
                <button
                  type="button"
                  disabled={busy || !draftQuestion.trim() || !draftAnswer.trim()}
                  onClick={() => void patch("promote")}
                  className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-medium text-black disabled:opacity-40"
                >
                  采纳为知识库
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {golden.length > 0 && (
        <section className="rounded-3xl border border-slate-800 bg-[#111827] p-5">
          <h2 className="text-sm font-medium text-slate-300">
            最近 golden_qa（{golden.length}）
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            {golden.slice(0, 10).map((g) => (
              <li key={g.id} className="border-t border-slate-800 pt-2">
                <p className="text-slate-200">{g.title || g.question.slice(0, 80)}</p>
                <p className="text-xs text-slate-500">
                  {new Date(g.createdAt).toLocaleString()}
                  {g.usedInFinetuneAt ? " · 已用于微调导出" : " · 待微调"}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
