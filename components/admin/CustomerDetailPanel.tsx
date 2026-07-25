"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { CustomerDetail } from "@/lib/admin-customers";

export default function CustomerDetailPanel({ userId }: { userId: string }) {
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/customers?userId=${encodeURIComponent(userId)}`,
        { credentials: "include" },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { customer: CustomerDetail };
      setCustomer(data.customer);
      setNotes(data.customer.notes || "");
      setTagsInput(data.customer.tags.join(", "));
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveCrm(extra?: { archived?: boolean }) {
    setSaving(true);
    setError(null);
    try {
      const tags = tagsInput
        .split(/[,，]/)
        .map((t) => t.trim())
        .filter(Boolean);
      const res = await fetch("/api/admin/customers", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          tags,
          notes,
          ...extra,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { customer: CustomerDetail };
      setCustomer(data.customer);
      setNotes(data.customer.notes || "");
      setTagsInput(data.customer.tags.join(", "));
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-slate-500">加载中…</p>;
  }
  if (!customer) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-red-300">{error || "客户不存在"}</p>
        <Link href="/admin/customers" className="text-cyan-400 hover:underline">
          ← 返回列表
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/admin/customers"
            className="text-xs text-cyan-400 hover:underline"
          >
            ← 客户列表
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-white">
            {customer.email || customer.id}
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            {customer.subscriptionStatus}
            {customer.archivedAt ? " · 已归档" : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={() =>
              void saveCrm({ archived: !customer.archivedAt })
            }
            className="rounded-xl border border-slate-700 px-3 py-2 text-sm text-slate-300"
          >
            {customer.archivedAt ? "取消归档" : "归档"}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="近 30 天 Tokens" value={String(customer.recentTokens)} />
        <Stat label="Playbook 运行" value={String(customer.playbookRuns)} />
        <Stat label="车辆数" value={String(customer.vehicleCount)} />
        <Stat
          label="试用截止"
          value={
            customer.trialEndsAt
              ? new Date(customer.trialEndsAt).toLocaleDateString()
              : "—"
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-3xl border border-slate-800 bg-[#111827] p-5">
          <h2 className="text-sm font-medium text-slate-300">档案</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <Row k="ID" v={customer.id} />
            <Row k="Stripe Customer" v={customer.stripeCustomerId || "—"} />
            <Row k="Subscription" v={customer.stripeSubscriptionId || "—"} />
            <Row
              k="周期结束"
              v={
                customer.currentPeriodEnd
                  ? new Date(customer.currentPeriodEnd).toLocaleString()
                  : "—"
              }
            />
            <Row
              k="注册"
              v={new Date(customer.createdAt).toLocaleString()}
            />
          </dl>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-[#111827] p-5">
          <h2 className="text-sm font-medium text-slate-300">CRM 备注 / 标签</h2>
          <label className="mt-3 block text-xs text-slate-500">
            标签（逗号分隔）
            <input
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
            />
          </label>
          <label className="mt-3 block text-xs text-slate-500">
            备注
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
            />
          </label>
          <button
            type="button"
            disabled={saving}
            onClick={() => void saveCrm()}
            className="mt-3 rounded-xl bg-cyan-500 px-4 py-2 text-sm font-medium text-black disabled:opacity-50"
          >
            {saving ? "保存中…" : "保存"}
          </button>
        </section>
      </div>

      <section className="rounded-3xl border border-slate-800 bg-[#111827] p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-slate-300">车辆</h2>
          <Link
            href={`/admin/business/chats`}
            className="text-xs text-cyan-400 hover:underline"
          >
            查看业务对话 →
          </Link>
        </div>
        {customer.vehicles.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">无车辆</p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-800">
            {customer.vehicles.map((v) => (
              <li
                key={v.id}
                className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
              >
                <span className="text-slate-200">
                  {[v.year, v.make, v.model].filter(Boolean).join(" ") || v.id}
                  {v.archived ? (
                    <span className="ml-2 text-xs text-amber-400">archived</span>
                  ) : null}
                </span>
                <span className="text-slate-500">
                  {v.mileage != null ? `${v.mileage} mi` : ""}{" "}
                  {v.market || ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-slate-800 bg-[#111827] p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-white">{value}</p>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-3">
      <dt className="w-28 shrink-0 text-slate-500">{k}</dt>
      <dd className="break-all text-slate-200">{v}</dd>
    </div>
  );
}
