"use client";

import type { PredictiveMaintenanceCard } from "@/lib/predictive-maintenance/engine";
import { formatDueAroundLine } from "@/lib/predictive-maintenance/engine";

type Props = {
  items: PredictiveMaintenanceCard[];
  onHowTo: (item: PredictiveMaintenanceCard) => void;
  onRemindLater: (item: PredictiveMaintenanceCard) => void;
  onMarkDone?: (item: PredictiveMaintenanceCard) => void;
};

const urgencyBadge: Record<
  PredictiveMaintenanceCard["urgency"],
  string
> = {
  overdue: "bg-amber-500/15 text-amber-200",
  due_soon: "bg-cyan-500/15 text-cyan-200",
  upcoming: "bg-slate-700/60 text-slate-300",
};

export default function UpcomingMaintenanceSection({
  items,
  onHowTo,
  onRemindLater,
  onMarkDone,
}: Props) {
  return (
    <section data-testid="home-upcoming-maintenance">
      <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        Upcoming Maintenance
      </h3>

      {items.length === 0 ? (
        <div
          data-testid="home-upcoming-empty"
          className="rounded-3xl border border-dashed border-slate-700 bg-[#111827]/60 px-4 py-6 text-sm leading-relaxed text-slate-400"
        >
          No upcoming items based on your mileage. Keep driving — we&apos;ll
          nudge you when something&apos;s due.
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li
              key={item.key}
              data-testid={`home-maint-${item.key}`}
              className="rounded-3xl border border-slate-800 bg-[#111827] p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <h4 className="text-sm font-semibold text-white">{item.title}</h4>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${urgencyBadge[item.urgency]}`}
                >
                  {item.urgency.replace("_", " ")}
                </span>
              </div>
              <p className="mt-1.5 text-xs text-slate-400">
                {formatDueAroundLine(item)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                DIY difficulty: {item.difficulty}
                {item.estCostUsd
                  ? ` · Est. parts: $${item.estCostUsd.min}–${item.estCostUsd.max}`
                  : ""}
              </p>
              {item.basedOnTypicalIntervals ? (
                <p className="mt-1 text-[11px] text-slate-600">
                  Based on typical intervals — confirm in your owner&apos;s
                  manual.
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  data-testid={`home-maint-howto-${item.key}`}
                  onClick={() => onHowTo(item)}
                  className="inline-flex min-h-[40px] items-center rounded-xl bg-cyan-500/90 px-3 text-xs font-semibold text-black hover:bg-cyan-400"
                >
                  How to do it
                </button>
                <button
                  type="button"
                  data-testid={`home-maint-snooze-${item.key}`}
                  onClick={() => onRemindLater(item)}
                  className="inline-flex min-h-[40px] items-center rounded-xl border border-slate-600 px-3 text-xs font-medium text-slate-300 hover:border-slate-500"
                >
                  Remind me later
                </button>
                {onMarkDone ? (
                  <button
                    type="button"
                    onClick={() => onMarkDone(item)}
                    className="inline-flex min-h-[40px] items-center px-2 text-xs text-slate-500 hover:text-slate-300"
                  >
                    Mark done
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
