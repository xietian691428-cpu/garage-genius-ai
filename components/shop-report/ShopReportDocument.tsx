import type { ShopReportPayload } from "@/lib/types/shop-report";
import { SHOP_REPORT_DISCLAIMER } from "@/lib/types/shop-report";

/** Read-only HTML rendering for /r/[token] and history preview. */
export default function ShopReportDocument({
  payload,
}: {
  payload: ShopReportPayload;
}) {
  const v = payload.vehicle;
  const ymm = [v.year, v.make, v.model, v.submodel].filter(Boolean).join(" ");
  const local = new Date(payload.generatedAtIso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const utc = new Date(payload.generatedAtIso)
    .toISOString()
    .replace("T", " ")
    .slice(0, 19);

  return (
    <article className="mx-auto max-w-2xl space-y-6 text-slate-800">
      <header className="border-b border-slate-200 pb-4">
        <p className="text-sm font-semibold text-cyan-700">Garage Genius AI</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
          Owner Diagnostic Summary
        </h1>
        <p className="mt-2 text-xs text-slate-500">
          {utc} UTC · Local: {local} · Report #{payload.reportId}
        </p>
        <p className="mt-2 text-sm font-medium text-slate-800">
          {[
            ymm,
            v.mileage != null ? `${v.mileage.toLocaleString()} mi` : null,
            v.vinFull
              ? `VIN ${v.vinFull}`
              : v.vinLast8
                ? `VIN …${v.vinLast8}`
                : null,
            v.plate ? `Plate ${v.plate}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </header>

      <section>
        <h2 className="text-xs font-bold uppercase tracking-wide text-cyan-700">
          Owner Observations
        </h2>
        <p className="mt-2 text-sm leading-relaxed">
          {payload.ownerObservations.symptoms || "—"}
        </p>
        {payload.ownerObservations.conditions ? (
          <p className="mt-2 text-sm text-slate-600">
            Conditions: {payload.ownerObservations.conditions}
          </p>
        ) : null}
      </section>

      <section>
        <h2 className="text-xs font-bold uppercase tracking-wide text-cyan-700">
          Diagnostic Data Retrieved
        </h2>
        {payload.diagnosticData.codes.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">
            No fault codes were captured in this session.
          </p>
        ) : (
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {payload.diagnosticData.codes.map((c) => (
              <li key={c.code}>
                <span className="font-semibold">{c.code}</span> — {c.definition}
                {c.severity ? ` (${c.severity})` : ""}
              </li>
            ))}
          </ul>
        )}
        {payload.diagnosticData.liveDataSummary ? (
          <p className="mt-2 text-sm text-slate-600">
            {payload.diagnosticData.liveDataSummary}
          </p>
        ) : null}
        {payload.diagnosticData.dataSourceNote ? (
          <p className="mt-1 text-xs text-slate-500">
            Data source: {payload.diagnosticData.dataSourceNote}
          </p>
        ) : null}
      </section>

      <section>
        <h2 className="text-xs font-bold uppercase tracking-wide text-cyan-700">
          Checks Already Completed by Owner
        </h2>
        {payload.checksCompleted.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">
            None clearly confirmed in this session.
          </p>
        ) : (
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {payload.checksCompleted.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-xs font-bold uppercase tracking-wide text-cyan-700">
          Possible Contributing Factors
        </h2>
        <p className="mt-2 text-xs text-slate-500">
          Common causes reported for this combination include the items below.
          These are for professional verification only.
        </p>
        <ol className="mt-3 list-decimal space-y-3 pl-5 text-sm">
          {payload.contributingFactors.map((f) => (
            <li key={f.title}>
              <p className="font-semibold">{f.title}</p>
              <p className="text-slate-700">{f.explanation}</p>
              <p className="text-xs text-slate-500">
                Verification idea: {f.howToVerify}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h2 className="text-xs font-bold uppercase tracking-wide text-cyan-700">
          Suggested Next Steps for Technician
        </h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
          {(payload.technicianNextSteps.length
            ? payload.technicianNextSteps
            : [
                "Verify codes, freeze frame, and basic power/grounds before further tests.",
              ]
          ).map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </section>

      {payload.ownerNotes?.trim() ? (
        <section>
          <h2 className="text-xs font-bold uppercase tracking-wide text-cyan-700">
            Owner Notes
          </h2>
          <p className="mt-2 text-sm">{payload.ownerNotes}</p>
        </section>
      ) : null}

      {payload.images && payload.images.length > 0 ? (
        <section>
          <h2 className="text-xs font-bold uppercase tracking-wide text-cyan-700">
            Appendix — Diagnostic Screenshots
          </h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {payload.images.slice(0, 3).map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={src}
                alt={`Diagnostic figure ${i + 1}`}
                className="max-h-64 w-full rounded-lg border border-slate-200 object-contain bg-slate-50"
              />
            ))}
          </div>
        </section>
      ) : null}

      <footer className="rounded-xl border border-slate-300 bg-slate-50 p-4 text-[11px] leading-relaxed text-slate-600">
        {payload.disclaimer || SHOP_REPORT_DISCLAIMER}
      </footer>
    </article>
  );
}
