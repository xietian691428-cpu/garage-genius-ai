"use client";

import { useEffect, useState } from "react";
import type { AuditLogRow } from "@/lib/admin-staff";

export default function AuditLogPanel() {
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/admin/staff?view=audit", {
          credentials: "include",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { logs: AuditLogRow[] };
        setLogs(data.logs);
      } catch (err) {
        setError(err instanceof Error ? err.message : "加载失败");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">操作日志</h1>
        <p className="mt-1 text-sm text-slate-400">
          admin_audit_logs — 客户 CRM 更新等写操作会写入此处
        </p>
      </div>

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
              <th className="px-4 py-3">操作者</th>
              <th className="px-4 py-3">模块</th>
              <th className="px-4 py-3">动作</th>
              <th className="px-4 py-3">目标</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  加载中…
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  暂无日志
                </td>
              </tr>
            ) : (
              logs.map((l) => (
                <tr key={l.id} className="border-t border-slate-800/80">
                  <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                    {new Date(l.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-slate-300">
                    {l.actorEmail || "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-400">{l.module}</td>
                  <td className="px-4 py-3 text-slate-200">{l.action}</td>
                  <td className="px-4 py-3 text-slate-500">
                    {[l.targetType, l.targetId].filter(Boolean).join(":") ||
                      "—"}
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
