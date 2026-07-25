import KnowledgeManager from "@/components/admin/KnowledgeManager";
import { listKnowledgeEntries } from "@/app/admin/actions";

export default async function AdminKnowledgePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const entries = await listKnowledgeEntries(q);

  return (
    <div className="space-y-4">
      <form className="flex gap-2">
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search title, content, vehicle…"
          className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm outline-none focus:border-cyan-400"
        />
        <button
          type="submit"
          className="rounded-2xl bg-slate-800 px-4 py-2.5 text-sm text-slate-200 hover:bg-slate-700"
        >
          Search
        </button>
      </form>
      <KnowledgeManager entries={entries} />
    </div>
  );
}
