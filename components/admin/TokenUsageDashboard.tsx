"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TokenStatsRange, TokenStatsResponse } from "@/lib/admin-token-stats";

function fmtTokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function fmtUsd(n: number) {
  if (n < 0.01 && n > 0) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

const RANGES: { id: TokenStatsRange; label: string }[] = [
  { id: "day", label: "24h" },
  { id: "week", label: "7 days" },
  { id: "month", label: "30 days" },
];

export default function TokenUsageDashboard() {
  const [range, setRange] = useState<TokenStatsRange>("week");
  const [data, setData] = useState<TokenStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (r: TokenStatsRange) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/token-stats?range=${r}`, {
        credentials: "include",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      setData((await res.json()) as TokenStatsResponse);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(range);
  }, [range, load]);

  const summary = data?.summary;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Token Usage</h1>
          <p className="mt-1 text-sm text-slate-400">
            LLM call ledger — trends, top routes / playbooks, and estimated
            provider cost.
          </p>
        </div>
        <div className="flex gap-2">
          {RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setRange(r.id)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                range === r.id
                  ? "bg-cyan-500 text-black"
                  : "bg-slate-800 text-slate-300 hover:bg-slate-700"
              }`}
            >
              {r.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => void load(range)}
            className="rounded-full border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:border-cyan-500/40 hover:text-cyan-300"
          >
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
          {/token_usage_events|does not exist/i.test(error) ? (
            <p className="mt-1 text-xs text-red-300/80">
              Apply migration{" "}
              <code className="text-red-100">022_token_usage_events.sql</code>{" "}
              then generate some AI traffic.
            </p>
          ) : null}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            label: "Total tokens",
            value: summary ? fmtTokens(summary.totalTokens) : "—",
          },
          {
            label: "Est. cost",
            value: summary ? fmtUsd(summary.totalCostUsd) : "—",
          },
          {
            label: "LLM calls",
            value: summary ? String(summary.totalCalls) : "—",
          },
          {
            label: "Unique users",
            value: summary ? String(summary.uniqueUsers) : "—",
          },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-3xl border border-slate-800 bg-[#111827] p-5"
          >
            <p className="text-xs uppercase tracking-wide text-slate-500">
              {card.label}
            </p>
            <p className="mt-2 text-2xl font-bold text-white">
              {loading && !summary ? "…" : card.value}
            </p>
          </div>
        ))}
      </div>

      {data?.marginMonth && (
        <section className="rounded-3xl border border-slate-800 bg-[#111827] p-5">
          <h2 className="text-sm font-semibold text-white">
            This UTC month — AI cost vs Stripe revenue
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            {data.marginMonth.periodYm} · SQL view{" "}
            <code className="text-slate-400">
              admin_ai_cost_vs_revenue_by_plan
            </code>
            . Paid plans target AI COGS ≈ 30% of list price.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                label: "AI cost",
                value: fmtUsd(data.marginMonth.totals.aiCostUsd),
              },
              {
                label: "Stripe revenue",
                value: fmtUsd(data.marginMonth.totals.revenueUsd),
              },
              {
                label: "Margin",
                value: fmtUsd(data.marginMonth.totals.marginUsd),
              },
              {
                label: "Vision calls",
                value: String(data.marginMonth.totals.visionCalls),
              },
            ].map((card) => (
              <div
                key={card.label}
                className="rounded-2xl border border-slate-800 bg-slate-950/40 px-4 py-3"
              >
                <p className="text-[11px] uppercase tracking-wide text-slate-500">
                  {card.label}
                </p>
                <p className="mt-1 text-lg font-semibold text-white">
                  {card.value}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-sm">
              <thead className="text-xs uppercase text-slate-500">
                <tr>
                  <th className="pb-2 font-medium">Plan</th>
                  <th className="pb-2 font-medium">Users</th>
                  <th className="pb-2 font-medium">AI cost</th>
                  <th className="pb-2 font-medium">Revenue</th>
                  <th className="pb-2 font-medium">Margin</th>
                  <th className="pb-2 font-medium">Vision</th>
                </tr>
              </thead>
              <tbody>
                {data.marginMonth.byPlan.map((row) => (
                  <tr
                    key={row.plan}
                    className="border-t border-slate-800/80"
                  >
                    <td className="py-2 text-slate-200">{row.plan}</td>
                    <td className="py-2 text-slate-400">{row.users}</td>
                    <td className="py-2 text-amber-300">
                      {fmtUsd(row.aiCostUsd)}
                    </td>
                    <td className="py-2 text-cyan-300">
                      {fmtUsd(row.revenueUsd)}
                    </td>
                    <td className="py-2 text-emerald-300">
                      {fmtUsd(row.marginUsd)}
                    </td>
                    <td className="py-2 text-slate-400">{row.visionCalls}</td>
                  </tr>
                ))}
                {!data.marginMonth.byPlan.length && (
                  <tr>
                    <td
                      colSpan={6}
                      className="py-6 text-center text-slate-500"
                    >
                      No billed usage or Stripe events this month yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {data?.costRates && (
        <p className="text-xs text-slate-500">
          DeepSeek: ${data.costRates.promptPer1M}/1M in · $
          {data.costRates.completionPer1M}/1M out
          {data.aiRates
            ? ` · Kimi: $${data.aiRates.kimi.promptPer1M}/1M in · $${data.aiRates.kimi.completionPer1M}/1M out · $${data.aiRates.kimi.perCallFloorUsd}/call floor`
            : ""}
          {summary
            ? ` · avg ${fmtTokens(summary.avgTokensPerCall)} tokens/call`
            : ""}
        </p>
      )}

      {data?.specGap && (
        <section className="rounded-3xl border border-slate-800 bg-[#111827] p-5">
          <h2 className="text-sm font-semibold text-white">
            Spec-gap demand (oil / interval / torque)
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Chat LLM turns in this range, tagged on{" "}
            <code className="text-slate-400">
              token_usage_events.metadata.spec_gap
            </code>{" "}
            (no message text, no VIN). Paid repair data stays deferred until a
            tag is ≥ {Math.round((data.specGap.revisitShare || 0.15) * 100)}% of
            Chat turns <span className="text-slate-400">and</span> ≥ 20 hits,{" "}
            <span className="text-slate-400">and</span> NHTSA + playbooks +
            “check the manual” still cannot cover the ask. See{" "}
            <code className="text-slate-400">docs/data-sources.md</code>.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {data.specGap.topics.map((topic) => (
              <div
                key={topic.tag}
                className="rounded-2xl border border-slate-800 bg-slate-950/40 px-4 py-3"
              >
                <p className="text-[11px] uppercase tracking-wide text-slate-500">
                  {topic.label}
                </p>
                <p className="mt-1 text-xl font-semibold text-white">
                  {topic.hits}
                  <span className="ml-2 text-sm font-normal text-slate-400">
                    {(topic.share * 100).toFixed(1)}%
                  </span>
                </p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-400">
            {data.specGap.taggedCalls}/{data.specGap.chatCalls} Chat turns
            tagged
            {data.specGap.volumeTrigger
              ? " · volume trigger ON — still confirm the coverage gap before any Auto.dev POC."
              : " · volume trigger off — do not open a paid-data POC."}
          </p>
        </section>
      )}

      {data?.safetyObserve && data.safetyObserve.taggedCalls > 0 && (
        <section className="rounded-3xl border border-slate-800 bg-[#111827] p-5">
          <h2 className="text-sm font-semibold text-white">
            Safety observe (read-only)
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Event names on{" "}
            <code className="text-slate-400">
              token_usage_events.metadata.safetyEvents
            </code>
            . No VIN, no prompts. Grep production logs for{" "}
            <code className="text-slate-400">[safety-observe]</code>.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {Object.entries(data.safetyObserve.counts).map(([event, hits]) => (
              <span
                key={event}
                className="rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-1.5 text-xs text-slate-300"
              >
                {event}
                <span className="ml-2 font-semibold text-white">{hits}</span>
              </span>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-400">
            {data.safetyObserve.taggedCalls} tagged call(s) in this range
          </p>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-3xl border border-slate-800 bg-[#111827] p-5">
          <h2 className="mb-4 text-sm font-semibold text-white">
            Token trend
          </h2>
          <div className="h-64 w-full">
            {data?.trend?.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.trend}>
                  <defs>
                    <linearGradient id="tokFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: "#94a3b8", fontSize: 11 }}
                    tickFormatter={(v: string) => v.slice(5)}
                  />
                  <YAxis
                    tick={{ fill: "#94a3b8", fontSize: 11 }}
                    tickFormatter={(v: number) => fmtTokens(v)}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#0f172a",
                      border: "1px solid #334155",
                      borderRadius: 12,
                    }}
                    labelStyle={{ color: "#e2e8f0" }}
                    formatter={(value) => [
                      fmtTokens(Number(value ?? 0)),
                      "Tokens",
                    ]}
                  />
                  <Area
                    type="monotone"
                    dataKey="tokens"
                    stroke="#22d3ee"
                    fill="url(#tokFill)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart loading={loading} />
            )}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-[#111827] p-5">
          <h2 className="mb-4 text-sm font-semibold text-white">
            Cost trend (USD)
          </h2>
          <div className="h-64 w-full">
            {data?.trend?.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.trend}>
                  <defs>
                    <linearGradient id="costFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#34d399" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: "#94a3b8", fontSize: 11 }}
                    tickFormatter={(v: string) => v.slice(5)}
                  />
                  <YAxis
                    tick={{ fill: "#94a3b8", fontSize: 11 }}
                    tickFormatter={(v: number) => `$${v}`}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#0f172a",
                      border: "1px solid #334155",
                      borderRadius: 12,
                    }}
                    formatter={(value) => [
                      fmtUsd(Number(value ?? 0)),
                      "Cost",
                    ]}
                  />
                  <Area
                    type="monotone"
                    dataKey="costUsd"
                    stroke="#34d399"
                    fill="url(#costFill)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart loading={loading} />
            )}
          </div>
        </section>
      </div>

      <section className="rounded-3xl border border-slate-800 bg-[#111827] p-5">
        <h2 className="mb-4 text-sm font-semibold text-white">
          Tokens by route
        </h2>
        <div className="h-72 w-full">
          {data?.byRoute?.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.byRoute}>
                <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                <XAxis
                  dataKey="route"
                  tick={{ fill: "#94a3b8", fontSize: 12 }}
                />
                <YAxis
                  tick={{ fill: "#94a3b8", fontSize: 11 }}
                  tickFormatter={(v: number) => fmtTokens(v)}
                />
                <Tooltip
                  contentStyle={{
                    background: "#0f172a",
                    border: "1px solid #334155",
                    borderRadius: 12,
                  }}
                  formatter={(value, name) => [
                    name === "costUsd"
                      ? fmtUsd(Number(value ?? 0))
                      : fmtTokens(Number(value ?? 0)),
                    String(name),
                  ]}
                />
                <Legend />
                <Bar dataKey="tokens" fill="#22d3ee" name="Tokens" radius={6} />
                <Bar dataKey="calls" fill="#64748b" name="Calls" radius={6} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart loading={loading} />
          )}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-3xl border border-slate-800 bg-[#111827] p-5">
          <h2 className="mb-4 text-sm font-semibold text-white">
            Top playbooks / features
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[320px] text-left text-sm">
              <thead className="text-xs uppercase text-slate-500">
                <tr>
                  <th className="pb-2 font-medium">Name</th>
                  <th className="pb-2 font-medium">Calls</th>
                  <th className="pb-2 font-medium">Tokens</th>
                  <th className="pb-2 font-medium">Cost</th>
                </tr>
              </thead>
              <tbody>
                {(data?.topPlaybooks || []).map((row) => (
                  <tr
                    key={row.playbookSlug}
                    className="border-t border-slate-800/80"
                  >
                    <td className="py-2.5 text-slate-200">
                      {row.playbookSlug}
                    </td>
                    <td className="py-2.5 text-slate-400">{row.calls}</td>
                    <td className="py-2.5 text-cyan-300">
                      {fmtTokens(row.tokens)}
                    </td>
                    <td className="py-2.5 text-emerald-300">
                      {fmtUsd(row.costUsd)}
                    </td>
                  </tr>
                ))}
                {!loading && !(data?.topPlaybooks?.length) && (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-slate-500">
                      No usage yet in this range.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-[#111827] p-5">
          <h2 className="mb-4 text-sm font-semibold text-white">
            Recent calls
          </h2>
          <div className="max-h-80 overflow-y-auto">
            <table className="w-full min-w-[420px] text-left text-sm">
              <thead className="sticky top-0 bg-[#111827] text-xs uppercase text-slate-500">
                <tr>
                  <th className="pb-2 font-medium">When</th>
                  <th className="pb-2 font-medium">Route</th>
                  <th className="pb-2 font-medium">Tokens</th>
                  <th className="pb-2 font-medium">Cost</th>
                </tr>
              </thead>
              <tbody>
                {(data?.recent || []).map((row) => (
                  <tr key={row.id} className="border-t border-slate-800/80">
                    <td className="py-2 text-xs text-slate-500">
                      {new Date(row.createdAt).toLocaleString()}
                    </td>
                    <td className="py-2 text-slate-300">
                      {row.playbookSlug || row.feature || row.route}
                    </td>
                    <td className="py-2 text-cyan-300">
                      {fmtTokens(row.totalTokens)}
                    </td>
                    <td className="py-2 text-emerald-300">
                      {fmtUsd(row.costUsd)}
                    </td>
                  </tr>
                ))}
                {!loading && !(data?.recent?.length) && (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-slate-500">
                      No recent events.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

function EmptyChart({ loading }: { loading: boolean }) {
  return (
    <div className="flex h-full items-center justify-center text-sm text-slate-500">
      {loading ? "Loading…" : "No data in this range"}
    </div>
  );
}
