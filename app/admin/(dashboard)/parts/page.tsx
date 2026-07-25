import PartsManager from "@/components/admin/PartsManager";
import { listAffiliateParts } from "@/app/admin/actions";

export default async function AdminPartsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const parts = await listAffiliateParts(q);

  return (
    <div className="space-y-4">
      <form className="flex gap-2">
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search OEM, name, brand, vehicle…"
          className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm outline-none focus:border-cyan-400"
        />
        <button
          type="submit"
          className="rounded-2xl bg-slate-800 px-4 py-2.5 text-sm text-slate-200 hover:bg-slate-700"
        >
          Search
        </button>
      </form>
      <PartsManager parts={parts} />
    </div>
  );
}
