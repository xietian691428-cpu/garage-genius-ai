"use client";

import { useEffect, useState } from "react";
import type { AdminStaffRow } from "@/lib/admin-staff";
import { ADMIN_ROLE_MODULES } from "@/lib/admin-nav";

export default function StaffPanel() {
  const [staff, setStaff] = useState<AdminStaffRow[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/admin/staff", { credentials: "include" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as {
          staff: AdminStaffRow[];
          note?: string;
        };
        setStaff(data.staff);
        setNote(data.note ?? null);
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
        <h1 className="text-2xl font-bold text-white">后台账号</h1>
        <p className="mt-1 text-sm text-slate-400">
          角色：超级管理员 / 运营 / 客服 — 按模块授权（骨架）
        </p>
      </div>

      {note && (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          {note}
          <p className="mt-1 text-xs text-amber-200/70">
            请执行 migration{" "}
            <code className="text-cyan-300">025_admin_ops_console.sql</code>{" "}
            后在 Supabase 插入 admin_staff 行。
          </p>
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="rounded-3xl border border-slate-800 bg-[#111827] p-5">
        <p className="text-sm font-medium text-slate-300">默认模块权限</p>
        <ul className="mt-3 space-y-2 text-sm text-slate-400">
          {Object.entries(ADMIN_ROLE_MODULES).map(([role, mods]) => (
            <li key={role}>
              <span className="text-slate-200">{role}</span>: {mods.join(", ")}
            </li>
          ))}
        </ul>
      </div>

      <div className="overflow-x-auto rounded-3xl border border-slate-800">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-900/80 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">邮箱</th>
              <th className="px-4 py-3">显示名</th>
              <th className="px-4 py-3">角色</th>
              <th className="px-4 py-3">状态</th>
              <th className="px-4 py-3">模块覆盖</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  加载中…
                </td>
              </tr>
            ) : staff.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  暂无 staff 记录（当前登录仍走 ADMIN_EMAIL cookie）
                </td>
              </tr>
            ) : (
              staff.map((s) => (
                <tr key={s.id} className="border-t border-slate-800/80">
                  <td className="px-4 py-3 text-slate-200">{s.email}</td>
                  <td className="px-4 py-3 text-slate-400">
                    {s.displayName || "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-300">{s.role}</td>
                  <td className="px-4 py-3">
                    {s.isActive ? (
                      <span className="text-emerald-400">active</span>
                    ) : (
                      <span className="text-slate-500">disabled</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {s.modules.length ? s.modules.join(", ") : "（角色默认）"}
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
