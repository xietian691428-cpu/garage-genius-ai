"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { OpsFunnelResponse } from "@/lib/admin-ops-funnel";

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows
    .map((r) =>
      r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","),
    )
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function OpsOverviewPanel() {
  const [data, setData] = useState<OpsFunnelResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/ops-funnel", {
        credentials: "include",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      setData((await res.json()) as OpsFunnelResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const funnelChart = data
    ? [
        { name: "注册", value: data.funnel.registered },
        { name: "试用", value: data.funnel.trial },
        { name: "付费", value: data.funnel.paid },
        { name: "续费", value: data.funnel.renewed },
      ]
    : [];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">运营总览</h1>
          <p className="mt-1 text-sm text-slate-400">
            订阅转化漏斗 · Token 成本 vs 收入 · 报表导出
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/ops/tokens"
            className="rounded-full bg-slate-900 px-3 py-1.5 text-xs text-slate-300"
          >
            Token 用量
          </Link>
          <Link
            href="/admin/ops/revenue"
            className="rounded-full bg-slate-900 px-3 py-1.5 text-xs text-slate-300"
          >
            收入与会员
          </Link>
          <button
            type="button"
            disabled={!data}
            onClick={() => {
              if (!data) return;
              downloadCsv(`ops-funnel-${Date.now()}.csv`, [
                ["metric", "value"],
                ["registered", String(data.funnel.registered)],
                ["trial", String(data.funnel.trial)],
                ["paid", String(data.funnel.paid)],
                ["renewed", String(data.funnel.renewed)],
                ["estimatedCostUsd", String(data.costVsRevenue.estimatedCostUsd)],
                ["revenueUsd", String(data.costVsRevenue.revenueUsd)],
                ["marginUsd", String(data.costVsRevenue.marginUsd)],
              ]);
            }}
            className="rounded-full bg-cyan-500/20 px-3 py-1.5 text-xs font-medium text-cyan-300 disabled:opacity-40"
          >
            导出 CSV
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {loading && !data ? (
        <p className="text-sm text-slate-500">加载中…</p>
      ) : data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="注册" value={String(data.funnel.registered)} />
            <Stat label="试用中" value={String(data.funnel.trial)} />
            <Stat label="付费会员" value={String(data.funnel.paid)} />
            <Stat label="续费用户*" value={String(data.funnel.renewed)} />
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <div className="rounded-3xl border border-slate-800 bg-[#111827] p-5">
              <p className="mb-4 text-sm font-medium text-slate-300">
                订阅转化漏斗
              </p>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={funnelChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="name" stroke="#64748b" fontSize={12} />
                  <YAxis stroke="#64748b" fontSize={12} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      background: "#0f172a",
                      border: "1px solid #334155",
                      borderRadius: 12,
                    }}
                  />
                  <Bar dataKey="value" fill="#22d3ee" radius={6} />
                </BarChart>
              </ResponsiveContainer>
              <p className="mt-2 text-xs text-slate-600">
                * 续费 ≈ 有 ≥2 次订阅类 invoice 的用户数
              </p>
            </div>

            <div className="rounded-3xl border border-slate-800 bg-[#111827] p-5">
              <p className="mb-4 text-sm font-medium text-slate-300">
                Token 成本 vs 收入（近 30 天）
              </p>
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-slate-500">预估 LLM 成本</dt>
                  <dd className="font-medium text-amber-300">
                    ${data.costVsRevenue.estimatedCostUsd.toFixed(2)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">收入</dt>
                  <dd className="font-medium text-emerald-300">
                    ${data.costVsRevenue.revenueUsd.toFixed(2)}
                  </dd>
                </div>
                <div className="flex justify-between border-t border-slate-800 pt-3">
                  <dt className="text-slate-400">毛利估算</dt>
                  <dd
                    className={`text-lg font-bold ${
                      data.costVsRevenue.marginUsd >= 0
                        ? "text-emerald-400"
                        : "text-rose-400"
                    }`}
                  >
                    ${data.costVsRevenue.marginUsd.toFixed(2)}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-slate-800 bg-[#111827] p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-white">{value}</p>
    </div>
  );
}
