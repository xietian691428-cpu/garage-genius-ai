import type { HealthSnapshotModel } from "@/lib/home-health";

type Props = {
  snapshot: HealthSnapshotModel;
  onPrimary: () => void;
};

const KIND_STYLE: Record<
  HealthSnapshotModel["kind"],
  { ring: string; badge: string }
> = {
  attention: {
    ring: "border-amber-700/50 bg-amber-950/30",
    badge: "bg-amber-500/15 text-amber-200",
  },
  maintenance: {
    ring: "border-cyan-700/40 bg-cyan-950/20",
    badge: "bg-cyan-500/15 text-cyan-200",
  },
  looking_good: {
    ring: "border-emerald-800/40 bg-emerald-950/20",
    badge: "bg-emerald-500/15 text-emerald-200",
  },
};

export default function VehicleHealthSnapshot({ snapshot, onPrimary }: Props) {
  const style = KIND_STYLE[snapshot.kind];

  return (
    <section
      data-testid="home-health-snapshot"
      className={`rounded-3xl border p-5 sm:p-6 ${style.ring}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Vehicle Health
          </p>
          <h2 className="mt-1 text-xl font-semibold text-white sm:text-2xl">
            <span
              className={`mr-2 inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${style.badge}`}
            >
              {snapshot.title}
            </span>
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-300">
            {snapshot.subtitle}
          </p>
          <p className="mt-3 text-[11px] text-slate-500">
            {snapshot.lastUpdatedLabel}
          </p>
        </div>
      </div>
      <button
        type="button"
        data-testid="home-health-primary"
        onClick={onPrimary}
        className="mt-5 inline-flex min-h-[44px] w-full items-center justify-center rounded-2xl bg-cyan-500 px-4 text-sm font-semibold text-black hover:bg-cyan-400 sm:w-auto"
      >
        {snapshot.primaryCta.label}
      </button>
    </section>
  );
}
