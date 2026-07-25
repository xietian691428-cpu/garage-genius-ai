"use client";

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
import type { RevenueStatsResponse } from "@/lib/admin-revenue-stats";

function fmtUsd(n: number) {
  return `$${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function RevenueDashboard() {
  const [data, setData] = useState<RevenueStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/revenue-stats", {
        credentials: "include",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      setData((await res.json()) as RevenueStatsResponse);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const s = data?.summary;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Revenue</h1>
          <p className="mt-1 text-sm text-slate-400">
            MRR, ARPU, and paid subscribers from{" "}
            <code className="text-slate-300">stripe_subscriptions</code> +
            invoice events.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-full border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:border-cyan-500/40 hover:text-cyan-300"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
          <p className="mt-1 text-xs text-red-300/80">
            Apply migration{" "}
            <code className="text-red-100">023_stripe_subscriptions_revenue.sql</code>{" "}
            and ensure Stripe webhooks are syncing.
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "MRR", value: s ? fmtUsd(s.mrrUsd) : "—" },
          { label: "ARR", value: s ? fmtUsd(s.arrUsd) : "—" },
          { label: "ARPU", value: s ? fmtUsd(s.arpuUsd) : "—" },
          {
            label: "Paid subscribers",
            value: s ? String(s.paidSubscribers) : "—",
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
              {loading && !s ? "…" : card.value}
            </p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Trialing", value: s ? String(s.trialing) : "—" },
          { label: "Free / canceled", value: s ? String(s.freeUsers) : "—" },
          {
            label: "Sub revenue (30d)",
            value: s ? fmtUsd(s.revenue30dUsd) : "—",
          },
          {
            label: "Token top-ups (30d)",
            value: s ? fmtUsd(s.recharge30dUsd) : "—",
          },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-3xl border border-slate-800 bg-[#111827] p-4"
          >
            <p className="text-xs uppercase tracking-wide text-slate-500">
              {card.label}
            </p>
            <p className="mt-1 text-lg font-semibold text-slate-100">
              {loading && !s ? "…" : card.value}
            </p>
          </div>
        ))}
      </div>

      <section className="rounded-3xl border border-slate-800 bg-[#111827] p-5">
        <h2 className="mb-4 text-sm font-semibold text-white">
          MRR by plan
        </h2>
        <div className="h-64 w-full">
          {data?.byPlan?.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.byPlan}>
                <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                <XAxis dataKey="plan" tick={{ fill: "#94a3b8", fontSize: 12 }} />
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
                  formatter={(value) => [fmtUsd(Number(value ?? 0)), "MRR"]}
                />
                <Bar dataKey="mrrUsd" fill="#22d3ee" name="MRR" radius={6} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">
              {loading ? "Loading…" : "No active paid subscriptions yet"}
            </div>
          )}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-800 bg-[#111827] p-5">
        <h2 className="mb-4 text-sm font-semibold text-white">
          Recent subscription invoices
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-sm">
            <thead className="text-xs uppercase text-slate-500">
              <tr>
                <th className="pb-2 font-medium">When</th>
                <th className="pb-2 font-medium">Kind</th>
                <th className="pb-2 font-medium">Plan</th>
                <th className="pb-2 font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {(data?.recentRevenue || []).map((row) => (
                <tr key={row.id} className="border-t border-slate-800/80">
                  <td className="py-2 text-xs text-slate-500">
                    {new Date(row.createdAt).toLocaleString()}
                  </td>
                  <td className="py-2 text-slate-300">{row.kind}</td>
                  <td className="py-2 text-slate-400">{row.plan || "—"}</td>
                  <td className="py-2 text-emerald-300">
                    {fmtUsd(row.amountUsd)}
                  </td>
                </tr>
              ))}
              {!loading && !(data?.recentRevenue?.length) && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-slate-500">
                    No invoice.paid events yet — enable the event in Stripe
                    webhooks.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
