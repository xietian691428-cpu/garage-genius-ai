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
import type {
  BusinessAnalytics,
  BusinessPlaybookRow,
} from "@/lib/admin-business";

type Filters = {
  make: string;
  model: string;
  scenarioSlug: string;
  vote: "" | "yes" | "no";
  q: string;
};

export default function BusinessPlaybooksPanel() {
  const [filters, setFilters] = useState<Filters>({
    make: "",
    model: "",
    scenarioSlug: "",
    vote: "",
    q: "",
  });
  const [applied, setApplied] = useState<Filters>(filters);
  const [rows, setRows] = useState<BusinessPlaybookRow[]>([]);
  const [analytics, setAnalytics] = useState<BusinessAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<BusinessPlaybookRow | null>(null);

  const load = useCallback(async (f: Filters) => {
    setLoading(true);
    setError(null);
    try {
      const sp = new URLSearchParams({ view: "playbooks" });
      if (f.make) sp.set("make", f.make);
      if (f.model) sp.set("model", f.model);
      if (f.scenarioSlug) sp.set("scenarioSlug", f.scenarioSlug);
      if (f.vote) sp.set("vote", f.vote);
      if (f.q) sp.set("q", f.q);
      const res = await fetch(`/api/admin/business?${sp}`, {
        credentials: "include",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as {
        rows: BusinessPlaybookRow[];
        analytics: BusinessAnalytics;
      };
      setRows(data.rows);
      setAnalytics(data.analytics);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(applied);
  }, [applied, load]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Coach / Playbook 记录</h1>
        <p className="mt-1 text-sm text-slate-400">
          步骤反馈、完成率与高频场景 — 筛选车型 / 场景 / 投票
        </p>
      </div>

      {analytics && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="反馈条数" value={String(analytics.totalFeedback)} />
          <Stat label="有用率" value={`${analytics.usefulRate}%`} />
          <Stat label="Yes" value={String(analytics.yesCount)} />
          <Stat label="No" value={String(analytics.noCount)} />
        </div>
      )}

      {analytics && analytics.topScenarios.length > 0 && (
        <div className="rounded-3xl border border-slate-800 bg-[#111827] p-5">
          <p className="mb-4 text-sm font-medium text-slate-300">
            高频场景排行
          </p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={analytics.topScenarios.map((s) => ({
                name: s.slug.slice(0, 18),
                count: s.count,
                yesRate: s.yesRate,
              }))}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="name" stroke="#64748b" fontSize={11} />
              <YAxis stroke="#64748b" fontSize={12} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  background: "#0f172a",
                  border: "1px solid #334155",
                  borderRadius: 12,
                }}
              />
              <Bar dataKey="count" name="反馈数" fill="#22d3ee" radius={6} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <form
        className="grid gap-3 rounded-3xl border border-slate-800 bg-[#111827] p-4 sm:grid-cols-2 lg:grid-cols-6"
        onSubmit={(e) => {
          e.preventDefault();
          setApplied({ ...filters });
        }}
      >
        <Input
          placeholder="车型 Make"
          value={filters.make}
          onChange={(v) => setFilters((f) => ({ ...f, make: v }))}
        />
        <Input
          placeholder="车型 Model"
          value={filters.model}
          onChange={(v) => setFilters((f) => ({ ...f, model: v }))}
        />
        <Input
          placeholder="场景 slug"
          value={filters.scenarioSlug}
          onChange={(v) => setFilters((f) => ({ ...f, scenarioSlug: v }))}
        />
        <select
          value={filters.vote}
          onChange={(e) =>
            setFilters((f) => ({
              ...f,
              vote: e.target.value as Filters["vote"],
            }))
          }
          className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
        >
          <option value="">全部投票</option>
          <option value="yes">有用 Yes</option>
          <option value="no">无用 No</option>
        </select>
        <Input
          placeholder="搜索邮箱 / 备注"
          value={filters.q}
          onChange={(v) => setFilters((f) => ({ ...f, q: v }))}
        />
        <button
          type="submit"
          className="rounded-xl bg-cyan-500 px-3 py-2 text-sm font-medium text-black"
        >
          筛选
        </button>
      </form>

      {error && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-3xl border border-slate-800">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-900/80 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">时间</th>
              <th className="px-4 py-3">客户</th>
              <th className="px-4 py-3">场景</th>
              <th className="px-4 py-3">步骤</th>
              <th className="px-4 py-3">车型</th>
              <th className="px-4 py-3">投票</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  加载中…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  暂无反馈记录
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr
                  key={r.id}
                  className="border-t border-slate-800/80 hover:bg-slate-900/40"
                >
                  <td className="whitespace-nowrap px-4 py-3 text-slate-400">
                    {new Date(r.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-slate-300">
                    {r.userEmail || r.userId?.slice(0, 8) || "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-200">{r.scenarioSlug}</td>
                  <td className="px-4 py-3 text-slate-400">{r.stepId}</td>
                  <td className="px-4 py-3 text-slate-400">
                    {[r.vehicleMake, r.vehicleModel].filter(Boolean).join(" ") ||
                      "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        r.vote === "yes" ? "text-emerald-400" : "text-rose-400"
                      }
                    >
                      {r.vote}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => setSelected(r)}
                      className="text-cyan-400 hover:underline"
                    >
                      详情
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setSelected(null)}
        >
          <div
            className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-slate-700 bg-[#111827] p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-white">反馈详情</h2>
            <dl className="mt-4 space-y-2 text-sm">
              <Row k="场景" v={selected.scenarioSlug} />
              <Row k="场景 ID" v={selected.scenarioId} />
              <Row k="步骤" v={selected.stepId} />
              <Row k="投票" v={selected.vote} />
              <Row k="客户" v={selected.userEmail || selected.userId || "—"} />
              <Row
                k="车辆"
                v={
                  [selected.vehicleMake, selected.vehicleModel]
                    .filter(Boolean)
                    .join(" ") || "—"
                }
              />
              <Row
                k="里程"
                v={
                  selected.vehicleMileage != null
                    ? String(selected.vehicleMileage)
                    : "—"
                }
              />
              <Row k="备注" v={selected.note || "—"} />
              <Row
                k="时间"
                v={new Date(selected.createdAt).toLocaleString()}
              />
            </dl>
            <button
              type="button"
              className="mt-6 rounded-xl bg-slate-800 px-4 py-2 text-sm text-slate-200"
              onClick={() => setSelected(null)}
            >
              关闭
            </button>
          </div>
        </div>
      )}
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

function Input({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600"
    />
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-3">
      <dt className="w-20 shrink-0 text-slate-500">{k}</dt>
      <dd className="break-all text-slate-200">{v}</dd>
    </div>
  );
}
