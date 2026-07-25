"use client";

import { useCallback, useEffect, useState } from "react";
import type { ChatThreadSummary } from "@/lib/admin-business";

type Message = {
  id: string;
  role: string;
  content: string;
  createdAt: string;
};

export default function BusinessChatsPanel() {
  const [threads, setThreads] = useState<ChatThreadSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<ChatThreadSummary | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [msgLoading, setMsgLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/business?view=chats", {
        credentials: "include",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { threads: ChatThreadSummary[] };
      setThreads(data.threads);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function openThread(t: ChatThreadSummary) {
    setActive(t);
    setMsgLoading(true);
    setMessages([]);
    try {
      const sp = new URLSearchParams({
        view: "thread",
        userId: t.userId,
        vehicleId: t.vehicleId,
      });
      const res = await fetch(`/api/admin/business?${sp}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { messages: Message[] };
      setMessages(data.messages);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载对话失败");
    } finally {
      setMsgLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">对话记录</h1>
        <p className="mt-1 text-sm text-slate-400">
          按客户 × 车辆汇总的 Chat 线程，可查看完整消息
        </p>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="overflow-hidden rounded-3xl border border-slate-800 lg:col-span-2">
          <div className="border-b border-slate-800 px-4 py-3 text-sm text-slate-400">
            最近线程 {loading ? "…" : `(${threads.length})`}
          </div>
          <ul className="max-h-[70vh] divide-y divide-slate-800/80 overflow-y-auto">
            {threads.map((t) => (
              <li key={`${t.userId}:${t.vehicleId}`}>
                <button
                  type="button"
                  onClick={() => void openThread(t)}
                  className={`w-full px-4 py-3 text-left transition hover:bg-slate-900/60 ${
                    active?.vehicleId === t.vehicleId &&
                    active?.userId === t.userId
                      ? "bg-slate-900"
                      : ""
                  }`}
                >
                  <p className="truncate text-sm font-medium text-white">
                    {t.userEmail || t.userId.slice(0, 8)}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    {t.messageCount} 条 · {new Date(t.lastAt).toLocaleString()}
                  </p>
                  <p className="mt-1 line-clamp-2 text-xs text-slate-400">
                    {t.preview}
                  </p>
                </button>
              </li>
            ))}
            {!loading && threads.length === 0 && (
              <li className="px-4 py-8 text-center text-sm text-slate-500">
                暂无对话
              </li>
            )}
          </ul>
        </div>

        <div className="rounded-3xl border border-slate-800 bg-[#111827] lg:col-span-3">
          {!active ? (
            <div className="flex h-64 items-center justify-center text-sm text-slate-500">
              选择左侧线程查看完整对话
            </div>
          ) : (
            <div className="flex max-h-[70vh] flex-col">
              <div className="border-b border-slate-800 px-4 py-3">
                <p className="text-sm font-medium text-white">
                  {active.userEmail || active.userId}
                </p>
                <p className="text-xs text-slate-500">
                  vehicle: {active.vehicleId}
                </p>
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto p-4">
                {msgLoading ? (
                  <p className="text-sm text-slate-500">加载中…</p>
                ) : (
                  messages.map((m) => (
                    <div
                      key={m.id}
                      className={`rounded-2xl px-3 py-2 text-sm ${
                        m.role === "user"
                          ? "ml-8 bg-cyan-500/10 text-slate-200"
                          : "mr-8 bg-slate-900 text-slate-300"
                      }`}
                    >
                      <p className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">
                        {m.role} · {new Date(m.createdAt).toLocaleString()}
                      </p>
                      <p className="whitespace-pre-wrap break-words">
                        {m.content}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
