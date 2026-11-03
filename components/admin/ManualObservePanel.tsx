"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { ManualStatsResponse, ManualStatsWindow } from "@/lib/admin-manual-stats";

function pct(n: number | null): string {
  if (n == null) return "—";
  return `${n}%`;
}

function WindowCard({ w }: { w: ManualStatsWindow }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-white">Last {w.days}d</h2>
        <span className="text-xs text-slate-500">
          since {new Date(w.since).toLocaleDateString()}
        </span>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-slate-500">Uploads</dt>
          <dd className="text-xl font-semibold text-white">{w.uploads}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Fail rate</dt>
          <dd className="text-xl font-semibold text-amber-300">
            {pct(w.failRate)}
          </dd>
          <dd className="text-xs text-slate-500">
            {w.failed} failed · {w.ready} ready · {w.processing} processing
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Mismatch rate</dt>
          <dd className="text-xl font-semibold text-orange-300">
            {pct(w.mismatchRate)}
          </dd>
          <dd className="text-xs text-slate-500">{w.mismatch} mismatch</dd>
        </div>
        <div>
          <dt className="text-slate-500">Save specs (of shown)</dt>
          <dd className="text-xl font-semibold text-cyan-300">
            {pct(w.saveSpecsOfShownRate)}
          </dd>
          <dd className="text-xs text-slate-500">
            {w.extractConfirmed} confirm · {w.extractRejected} reject ·{" "}
            {w.extractPending} pending
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Save specs (among decided)</dt>
          <dd className="text-xl font-semibold text-cyan-200">
            {pct(w.saveSpecsAmongDecidedRate)}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Garage from manual</dt>
          <dd className="text-xl font-semibold text-white">
            {w.garageFromManual}
          </dd>
          <dd className="text-xs text-slate-500">
            oil_capacity_source = user_manual_confirmed (all-time)
          </dd>
        </div>
      </dl>
    </div>
  );
}

export default function ManualObservePanel() {
  const [data, setData] = useState<ManualStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/manual-stats", {
        credentials: "include",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      setData((await res.json()) as ManualStatsResponse);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">手册观察</h1>
          <p className="mt-1 text-sm text-slate-400">
            上传失败率 · YMM mismatch · 用户是否点 Save oil specs
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/ops"
            className="rounded-full bg-slate-900 px-3 py-1.5 text-xs text-slate-300"
          >
            运营总览
          </Link>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-full border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:border-cyan-500/40 hover:text-cyan-300"
          >
            Refresh
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
        <div className="grid gap-4 lg:grid-cols-2">
          {data.windows.map((w) => (
            <WindowCard key={w.days} w={w} />
          ))}
        </div>
      ) : null}

      <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-5 text-sm text-slate-300">
        <h2 className="font-semibold text-white">日志</h2>
        <p className="mt-2 text-slate-400">
          Vercel 生产日志 grep{" "}
          <code className="text-cyan-300">[manual-observe]</code>
          。事件：upload_reject / upload_storage_fail / upload_insert_fail /
          process_ready / process_failed / process_sparse / mismatch /
          mismatch_confirmed / extract_confirm / extract_reject / extract_edit /
          manual_deleted。
        </p>
        {data?.note ? (
          <p className="mt-2 text-xs text-slate-500">{data.note}</p>
        ) : null}
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-5 text-sm text-slate-300">
        <h2 className="font-semibold text-white">生产失败排查</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-slate-400">
          <li>
            <span className="text-slate-200">上传 500 / 不 processing</span>
            — Storage 策略、migration、bucket 权限
          </li>
          <li>
            <span className="text-slate-200">永远不 ready</span>
            — 日志看 chunk 数；对比本地 MIN_CHUNK 修复是否在包内
          </li>
          <li>
            <span className="text-slate-200">跨车泄漏</span>
            — 立刻 P0，回查 vehicle_id 过滤
          </li>
          <li>
            <span className="text-slate-200">仍假 ready</span>
            — 确认「无 chunk 不得 ready」已部署
          </li>
        </ul>
      </div>
    </div>
  );
}
