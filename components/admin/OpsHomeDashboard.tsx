"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { OpsOverviewResponse, OpsRange } from "@/lib/admin-ops-stats";

function fmtUsd(n: number) {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function fmtNum(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

const RANGES: { id: OpsRange; label: string }[] = [
  { id: "7d", label: "近 7 天" },
  { id: "30d", label: "近 30 天" },
];

export default function OpsHomeDashboard() {
  const [range, setRange] = useState<OpsRange>("7d");
  const [data, setData] = useState<OpsOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (r: OpsRange) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/ops-overview?range=${r}`, {
        credentials: "include",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      setData((await res.json()) as OpsOverviewResponse);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(range);
  }, [range, load]);

  const cards = data
    ? [
        {
          label: "今日新增客户",
          value: fmtNum(data.cards.newCustomersToday),
        },
        { label: "日活 (DAU)", value: fmtNum(data.cards.dauToday) },
        {
          label: "本月充值金额",
          value: fmtUsd(data.cards.rechargeMonthUsd),
        },
        { label: "AI 调用次数", value: fmtNum(data.cards.aiCallsToday) },
        { label: "Pro 会员数", value: fmtNum(data.cards.proMembers) },
        { label: "ARPU", value: fmtUsd(data.cards.arpuUsd) },
      ]
    : [];

  const chartData =
    data?.trends.days.map((d) => ({
      ...d,
      label: d.date.slice(5),
    })) ?? [];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">数据面板</h1>
          <p className="mt-1 text-sm text-slate-400">
            核心运营指标与趋势 — Garage Genius 运营后台主页
          </p>
        </div>
        <div className="flex gap-2">
          {RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setRange(r.id)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                range === r.id
                  ? "bg-cyan-500/20 text-cyan-300"
                  : "bg-slate-900 text-slate-400 hover:text-slate-200"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
          <p className="mt-1 text-xs text-red-300/80">
            若表不存在，请先在 Supabase 执行 migration 022–025。
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {(loading && !data
          ? Array.from({ length: 6 }).map((_, i) => ({
              label: "…",
              value: "—",
              key: i,
            }))
          : cards.map((c) => ({ ...c, key: c.label }))
        ).map((card) => (
          <div
            key={card.key}
            className="rounded-3xl border border-slate-800 bg-[#111827] p-5"
          >
            <p className="text-xs uppercase tracking-wide text-slate-500">
              {card.label}
            </p>
            <p className="mt-2 text-3xl font-bold text-white">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <ChartCard title="新增客户 / 日活">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="label" stroke="#64748b" fontSize={12} />
              <YAxis stroke="#64748b" fontSize={12} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  background: "#0f172a",
                  border: "1px solid #334155",
                  borderRadius: 12,
                }}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="newCustomers"
                name="新增客户"
                stroke="#22d3ee"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="dau"
                name="日活"
                stroke="#a78bfa"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="收入 (USD)">
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="label" stroke="#64748b" fontSize={12} />
              <YAxis stroke="#64748b" fontSize={12} />
              <Tooltip
                contentStyle={{
                  background: "#0f172a",
                  border: "1px solid #334155",
                  borderRadius: 12,
                }}
              />
              <Area
                type="monotone"
                dataKey="revenueUsd"
                name="收入"
                stroke="#34d399"
                fill="#34d39933"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Token 消耗" className="xl:col-span-2">
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="label" stroke="#64748b" fontSize={12} />
              <YAxis stroke="#64748b" fontSize={12} />
              <Tooltip
                contentStyle={{
                  background: "#0f172a",
                  border: "1px solid #334155",
                  borderRadius: 12,
                }}
              />
              <Area
                type="monotone"
                dataKey="tokens"
                name="Tokens"
                stroke="#fbbf24"
                fill="#fbbf2433"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div>
        <p className="mb-3 text-sm font-medium text-slate-300">快速入口</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            {
              href: "/admin/business/playbooks",
              title: "业务记录",
              desc: "Coach / Playbook 反馈与用量",
            },
            {
              href: "/admin/customers",
              title: "客户列表",
              desc: "档案、车辆、订阅与备注",
            },
            {
              href: "/admin/knowledge",
              title: "知识库",
              desc: "RAG 条目维护与扩充",
            },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-2xl border border-slate-800 bg-[#111827] p-4 transition hover:border-cyan-500/40"
            >
              <p className="font-medium text-white">{item.title}</p>
              <p className="mt-1 text-sm text-slate-400">{item.desc}</p>
            </Link>
          ))}
        </div>
      </div>

      {data && (
        <p className="text-xs text-slate-600">
          更新于 {new Date(data.generatedAt).toLocaleString()}
        </p>
      )}
    </div>
  );
}

function ChartCard({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-3xl border border-slate-800 bg-[#111827] p-5 ${className}`}
    >
      <p className="mb-4 text-sm font-medium text-slate-300">{title}</p>
      {children}
    </div>
  );
}
