"use client";

import { useState } from "react";

/**
 * Compare-test scaffold: same question, two answer drafts side-by-side.
 * Wire to /api/chat or RAG preview in a follow-up.
 */
export default function AdminKnowledgeComparePage() {
  const [question, setQuestion] = useState("");
  const [left, setLeft] = useState("");
  const [right, setRight] = useState("");
  const [note, setNote] = useState("");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">对比测试</h1>
        <p className="mt-1 text-sm text-slate-400">
          同一问题粘贴不同版本回答，记录偏好（骨架；后续可接双模型调用）
        </p>
      </div>

      <label className="block text-sm text-slate-400">
        测试问题
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
          placeholder="例如：刹车异响怎么排查？"
        />
      </label>

      <div className="grid gap-4 lg:grid-cols-2">
        <label className="block text-sm text-slate-400">
          版本 A
          <textarea
            value={left}
            onChange={(e) => setLeft(e.target.value)}
            rows={12}
            className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
          />
        </label>
        <label className="block text-sm text-slate-400">
          版本 B
          <textarea
            value={right}
            onChange={(e) => setRight(e.target.value)}
            rows={12}
            className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
          />
        </label>
      </div>

      <label className="block text-sm text-slate-400">
        优化记录 / 结论
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
          placeholder="A 更安全 / B 召回更准…"
        />
      </label>

      <button
        type="button"
        onClick={() => {
          const payload = {
            question,
            left,
            right,
            note,
            at: new Date().toISOString(),
          };
          const blob = new Blob([JSON.stringify(payload, null, 2)], {
            type: "application/json",
          });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `kb-compare-${Date.now()}.json`;
          a.click();
          URL.revokeObjectURL(url);
        }}
        className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-medium text-black"
      >
        导出本次对比记录
      </button>
    </div>
  );
}
