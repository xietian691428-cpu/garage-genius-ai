import Link from "next/link";

/**
 * Knowledge ingest scaffold — upload JSONL / manual add entry point.
 * Full seeding still uses scripts/seed-knowledge.ts + KnowledgeManager.
 */
export default function AdminKnowledgeIngestPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">知识库扩充</h1>
        <p className="mt-1 text-sm text-slate-400">
          上传 JSONL / 手动添加入口（骨架已就绪，批量入库走 seed 脚本）
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-3xl border border-slate-800 bg-[#111827] p-5">
          <h2 className="text-sm font-medium text-slate-200">JSONL 上传</h2>
          <p className="mt-2 text-sm text-slate-400">
            推荐流程：将转换后的 seed JSON 放入{" "}
            <code className="text-cyan-400">scripts/data/</code>，然后执行：
          </p>
          <pre className="mt-3 overflow-x-auto rounded-xl bg-slate-950 p-3 text-xs text-slate-300">
            {`npm run seed:knowledge:file:text
# 或带 embedding
npm run seed:knowledge:file`}
          </pre>
          <p className="mt-3 text-xs text-slate-500">
            UI 直传将在下一迭代接入（需 storage + 后台 job）。
          </p>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-[#111827] p-5">
          <h2 className="text-sm font-medium text-slate-200">手动添加 / 飞轮自愈</h2>
          <p className="mt-2 text-sm text-slate-400">
            单条 CRUD，或从 Coach 差评审核后「采纳为知识库」（即时进 RAG）。
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/admin/knowledge"
              className="inline-block rounded-xl bg-cyan-500 px-4 py-2 text-sm font-medium text-black"
            >
              打开知识条目
            </Link>
            <Link
              href="/admin/knowledge/flywheel"
              className="inline-block rounded-xl border border-cyan-500/40 px-4 py-2 text-sm text-cyan-300"
            >
              飞轮审核队列
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
