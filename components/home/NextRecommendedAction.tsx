import type { NextActionModel } from "@/lib/home-health";

type Props = {
  action: NextActionModel;
  onPrimary: () => void;
  onSecondary: () => void;
};

export default function NextRecommendedAction({
  action,
  onPrimary,
  onSecondary,
}: Props) {
  return (
    <section
      data-testid="home-next-action"
      className="rounded-3xl border border-cyan-500/30 bg-gradient-to-br from-cyan-500/10 via-[#111827] to-[#0d1424] p-5 sm:p-6"
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-cyan-400/80">
        Next recommended action
      </p>
      <h2 className="mt-2 text-lg font-semibold leading-snug text-white sm:text-xl">
        {action.title}
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-slate-300">{action.body}</p>
      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center">
        <button
          type="button"
          data-testid="home-next-primary"
          onClick={onPrimary}
          className="inline-flex min-h-[48px] flex-1 items-center justify-center rounded-2xl bg-cyan-500 px-4 text-sm font-semibold text-black hover:bg-cyan-400"
        >
          {action.primary.label}
        </button>
        <button
          type="button"
          data-testid="home-next-secondary"
          onClick={onSecondary}
          className="min-h-[44px] px-2 text-sm font-medium text-cyan-300 hover:underline"
        >
          {action.secondaryLabel}
        </button>
      </div>
    </section>
  );
}
