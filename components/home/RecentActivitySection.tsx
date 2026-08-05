"use client";

export type RecentActivityItem = {
  id: string;
  label: string;
  detail: string;
  onClick?: () => void;
};

type Props = {
  items: RecentActivityItem[];
};

export default function RecentActivitySection({ items }: Props) {
  if (items.length === 0) return null;

  return (
    <section data-testid="home-recent-activity">
      <details className="group rounded-3xl border border-slate-800 bg-[#111827]/80 open:bg-[#111827]">
        <summary className="cursor-pointer list-none px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500 [&::-webkit-details-marker]:hidden">
          Recent activity
          <span className="ml-2 font-normal normal-case text-slate-600 group-open:hidden">
            · {items.length}
          </span>
        </summary>
        <ul className="space-y-2 border-t border-slate-800 px-4 py-3">
          {items.map((item) => (
            <li key={item.id}>
              {item.onClick ? (
                <button
                  type="button"
                  onClick={item.onClick}
                  className="w-full rounded-2xl border border-slate-800 bg-slate-950/40 px-3 py-2.5 text-left hover:border-cyan-500/30"
                >
                  <p className="text-sm font-medium text-slate-200">
                    {item.label}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">{item.detail}</p>
                </button>
              ) : (
                <div className="rounded-2xl border border-slate-800 bg-slate-950/40 px-3 py-2.5">
                  <p className="text-sm font-medium text-slate-200">
                    {item.label}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">{item.detail}</p>
                </div>
              )}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
