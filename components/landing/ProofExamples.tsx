import type { ReactNode } from "react";
import Link from "next/link";
import { FileText, ShieldCheck } from "lucide-react";
import {
  EXAMPLE_BADGE,
  EXAMPLE_FICTIONAL_NOTE,
  EXAMPLE_NOT_OEM,
  MANUAL_CITATION_EXAMPLE,
  SHOP_HANDOFF_EXAMPLE,
  SOURCED_ANSWER_EXAMPLE,
} from "@/content/examples/proof-examples";

/** Clear, repeated marker so no card can pass as a real customer case. */
function ExampleBadge({ children = EXAMPLE_BADGE }: { children?: string }) {
  return (
    <span
      data-testid="proof-example-badge"
      className="inline-flex items-center rounded-full border border-amber-400/60 bg-amber-400/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-amber-200"
    >
      {children}
    </span>
  );
}

function SourceChip({ label, muted }: { label: string; muted?: boolean }) {
  return (
    <p
      className={`mt-3 inline-flex flex-wrap items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[11px] leading-snug ${
        muted
          ? "border-slate-600 bg-slate-900/60 text-slate-300"
          : "border-cyan-500/40 bg-cyan-500/10 text-cyan-200"
      }`}
    >
      <span className="font-semibold">Source:</span>
      <span>{label}</span>
    </p>
  );
}

/** Same bubble look as Chat (bg-slate-800 / rounded-3xl), static content only. */
function ChatBubbleShell({
  question,
  children,
}: {
  question: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <p className="max-w-[92%] rounded-3xl bg-blue-600 px-4 py-3 text-sm text-white">
          {question}
        </p>
      </div>
      <div className="max-w-[min(36rem,100%)] rounded-3xl bg-slate-800 px-4 py-3.5 sm:px-5 sm:py-4">
        {children}
      </div>
    </div>
  );
}

function SourcedAnswerCard() {
  const e = SOURCED_ANSWER_EXAMPLE;
  return (
    <article
      data-testid="proof-sourced-answer"
      className="rounded-3xl border border-slate-700 bg-[#111827] p-4 sm:p-5"
    >
      <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-[family-name:var(--font-display)] text-base font-semibold text-white">
          <ShieldCheck className="h-4 w-4 text-cyan-400" aria-hidden />
          Sourced answer
        </h3>
        <ExampleBadge />
      </header>
      <p className="mb-3 text-xs text-slate-400">{e.vehicle}</p>
      <ChatBubbleShell question={e.question}>
        <div className="chat-markdown prose prose-invert max-w-none text-[15px]">
          <ol>
            {e.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          <p>
            <strong>{e.specLine}</strong>
          </p>
        </div>
        <SourceChip label={e.sourceLabel} />
        <p className="mt-2 text-xs leading-relaxed text-slate-300">
          {e.verifyLine} {EXAMPLE_NOT_OEM}.
        </p>
        <p className="mt-2 rounded-xl border border-amber-500/30 bg-amber-950/30 px-3 py-2 text-xs leading-relaxed text-amber-100">
          <span className="font-semibold">Stop if:</span> {e.stopLine}
        </p>
      </ChatBubbleShell>
      <p className="mt-3 text-[11px] text-slate-400">{EXAMPLE_FICTIONAL_NOTE}</p>
    </article>
  );
}

function ShopHandoffCard() {
  const e = SHOP_HANDOFF_EXAMPLE;
  // Same section titles + paper styling as ShopReportDocument; static copy only.
  return (
    <article
      data-testid="proof-shop-handoff"
      className="gg-paper rounded-3xl border border-slate-300 bg-white p-4 text-slate-800 shadow-sm sm:p-5"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-[family-name:var(--font-display)] text-base font-semibold text-slate-900">
          <FileText className="h-4 w-4 text-cyan-700" aria-hidden />
          Shop handoff
        </h3>
        <ExampleBadge>Example — sample shop handoff</ExampleBadge>
      </div>

      <header className="border-b border-slate-200 pb-3">
        <p className="text-sm font-semibold text-cyan-700">Garage Genius AI</p>
        <p className="mt-1 text-lg font-bold tracking-tight text-slate-900">
          Owner Diagnostic Summary
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Report #{e.reportId} · No VIN or personal details in this example
        </p>
        <p className="mt-1 text-sm font-medium text-slate-800">
          {e.vehicleLine}
        </p>
      </header>

      <div className="mt-4 space-y-4">
        <section>
          <h4 className="text-xs font-bold uppercase tracking-wide text-cyan-700">
            Owner Observations
          </h4>
          <p className="mt-1.5 text-sm leading-relaxed">{e.symptoms}</p>
        </section>

        <section>
          <h4 className="text-xs font-bold uppercase tracking-wide text-cyan-700">
            Checks Already Completed by Owner
          </h4>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm">
            {e.checks.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </section>

        <section>
          <h4 className="text-xs font-bold uppercase tracking-wide text-cyan-700">
            Possible Contributing Factors
          </h4>
          <p className="mt-1 text-xs text-slate-500">
            For professional verification only.
          </p>
          <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm">
            {e.factors.map((f) => (
              <li key={f.title}>
                <p className="font-semibold">{f.title}</p>
                <p className="text-xs text-slate-500">
                  Verification idea: {f.howToVerify}
                </p>
              </li>
            ))}
          </ol>
        </section>

        <section>
          <h4 className="text-xs font-bold uppercase tracking-wide text-cyan-700">
            Suggested Next Steps for Technician
          </h4>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm">
            {e.nextSteps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </section>
      </div>

      <footer className="mt-4 rounded-xl border border-slate-300 bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-600">
        {e.footer}
      </footer>
    </article>
  );
}

function ManualCitationCard() {
  const e = MANUAL_CITATION_EXAMPLE;
  return (
    <article
      data-testid="proof-manual-citation"
      className="rounded-3xl border border-slate-700 bg-[#111827] p-4 sm:p-5"
    >
      <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-[family-name:var(--font-display)] text-base font-semibold text-white">
          Manual citation: before and after you confirm
        </h3>
        <ExampleBadge />
      </header>
      <p className="mb-4 text-xs text-slate-400">
        {e.vehicle} · “{e.question}”
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        <div data-testid="proof-manual-before">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            {e.before.title}
          </p>
          <ChatBubbleShell question={e.question}>
            <p className="text-[15px] leading-relaxed text-slate-100">
              {e.before.answer}
            </p>
            <SourceChip label={e.before.sourceLabel} muted />
          </ChatBubbleShell>
        </div>

        <div data-testid="proof-manual-after">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-cyan-300">
            {e.after.title}
          </p>
          <ChatBubbleShell question={e.question}>
            <p className="text-[15px] leading-relaxed text-slate-100">
              {e.after.answer}
            </p>
            <p className="mt-2 text-lg font-semibold text-white">
              {e.after.figures}
            </p>
            <SourceChip label={e.after.sourceLabel} />
            <p className="mt-2 text-xs text-slate-300">{EXAMPLE_NOT_OEM}.</p>
          </ChatBubbleShell>
        </div>
      </div>

      <p className="mt-3 text-[11px] text-slate-400">{EXAMPLE_FICTIONAL_NOTE}</p>
    </article>
  );
}

export default function ProofExamples({
  variant = "full",
}: {
  variant?: "full" | "compact";
}) {
  const compact = variant === "compact";
  return (
    <section
      id="proof"
      data-testid="proof-examples"
      className={compact ? "mt-14" : "landing-section"}
    >
      <div className="landing-section-head">
        <h2 className="font-[family-name:var(--font-display)]">
          Why trust the guidance
        </h2>
        <p>
          Every card below is a static <strong>Example</strong> — not a real
          customer, car, or manual. It shows how Garage Genius labels sources,
          cites your confirmed manual, and hands a clear summary to your shop.
        </p>
      </div>

      <div
        className={compact ? "max-w-2xl" : "grid gap-5 lg:grid-cols-2"}
      >
        <SourcedAnswerCard />
        {compact ? null : <ShopHandoffCard />}
      </div>

      {compact ? null : (
        <div className="mt-5">
          <ManualCitationCard />
        </div>
      )}

      {compact ? (
        <p className="mt-4 text-sm text-slate-400">
          <Link href="/#proof" className="text-cyan-300 hover:underline">
            See the shop handoff and manual-citation examples
          </Link>
        </p>
      ) : null}
    </section>
  );
}
