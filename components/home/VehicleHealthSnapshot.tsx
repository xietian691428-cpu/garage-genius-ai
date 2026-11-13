import type { HealthSnapshotModel } from "@/lib/home-health";

type Props = {
  snapshot: HealthSnapshotModel;
  /**
   * Optional quiet text link. Home passes nothing so the first screen has a
   * single primary CTA (Next recommended action) — this card is status only.
   */
  onPrimary?: () => void;
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
      className={`rounded-3xl border p-4 sm:p-5 ${style.ring}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Vehicle health
          </p>
          <h2 className="mt-1 text-lg font-semibold text-white sm:text-xl">
            <span
              className={`mr-2 inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${style.badge}`}
            >
              {snapshot.title}
            </span>
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-300 sm:text-base">
            {snapshot.subtitle}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            {snapshot.lastUpdatedLabel}
          </p>
        </div>
      </div>
      {onPrimary ? (
        <button
          type="button"
          data-testid="home-health-primary"
          onClick={onPrimary}
          className="mt-3 min-h-[44px] text-sm font-medium text-cyan-300 hover:underline"
        >
          {snapshot.primaryCta.label}
        </button>
      ) : null}
    </section>
  );
}
