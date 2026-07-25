"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { CustomerListItem } from "@/lib/admin-customers";

export default function CustomersPanel() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [archived, setArchived] = useState<"exclude" | "include" | "only">(
    "exclude",
  );
  const [applied, setApplied] = useState<{
    q: string;
    status: string;
    archived: "exclude" | "include" | "only";
  }>({ q: "", status: "", archived: "exclude" });
  const [customers, setCustomers] = useState<CustomerListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (f: typeof applied) => {
    setLoading(true);
    setError(null);
    try {
      const sp = new URLSearchParams();
      if (f.q) sp.set("q", f.q);
      if (f.status) sp.set("status", f.status);
      sp.set("archived", f.archived);
      const res = await fetch(`/api/admin/customers?${sp}`, {
        credentials: "include",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as {
        customers: CustomerListItem[];
        total: number;
      };
      setCustomers(data.customers);
      setTotal(data.total);
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
        <h1 className="text-2xl font-bold text-white">客户列表</h1>
        <p className="mt-1 text-sm text-slate-400">
          档案、订阅、车辆数与 CRM 标签备注（共 {total}）
        </p>
      </div>

      <form
        className="flex flex-wrap gap-3 rounded-3xl border border-slate-800 bg-[#111827] p-4"
        onSubmit={(e) => {
          e.preventDefault();
          setApplied({ q, status, archived });
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜索邮箱"
          className="min-w-[200px] flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
        >
          <option value="">全部状态</option>
          <option value="free">free</option>
          <option value="trialing">trialing</option>
          <option value="pro">pro</option>
          <option value="pro_heavy">pro_heavy</option>
          <option value="active">active</option>
          <option value="canceled">canceled</option>
        </select>
        <select
          value={archived}
          onChange={(e) =>
            setArchived(e.target.value as typeof archived)
          }
          className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
        >
          <option value="exclude">活跃客户</option>
          <option value="include">含已归档</option>
          <option value="only">仅归档</option>
        </select>
        <button
          type="submit"
          className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-medium text-black"
        >
          搜索
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
              <th className="px-4 py-3">邮箱</th>
              <th className="px-4 py-3">订阅</th>
              <th className="px-4 py-3">车辆</th>
              <th className="px-4 py-3">标签</th>
              <th className="px-4 py-3">注册</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  加载中…
                </td>
              </tr>
            ) : customers.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  无匹配客户
                </td>
              </tr>
            ) : (
              customers.map((c) => (
                <tr
                  key={c.id}
                  className="border-t border-slate-800/80 hover:bg-slate-900/40"
                >
                  <td className="px-4 py-3 text-slate-200">
                    {c.email || c.id.slice(0, 8)}
                    {c.archivedAt && (
                      <span className="ml-2 text-xs text-amber-400">已归档</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-400">
                    {c.subscriptionStatus}
                  </td>
                  <td className="px-4 py-3 text-slate-400">{c.vehicleCount}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {c.tags.length === 0 ? (
                        <span className="text-slate-600">—</span>
                      ) : (
                        c.tags.map((t) => (
                          <span
                            key={t}
                            className="rounded-md bg-slate-800 px-1.5 py-0.5 text-xs text-slate-300"
                          >
                            {t}
                          </span>
                        ))
                      )}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                    {new Date(c.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/customers/${c.id}`}
                      className="text-cyan-400 hover:underline"
                    >
                      详情
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
