"use client";

import { useEffect, useState } from "react";
import { applyGarageMode, readGarageMode } from "@/lib/garage-mode";

export default function GarageModeToggle() {
  const [on, setOn] = useState(false);

  useEffect(() => {
    setOn(readGarageMode());
  }, []);

  return (
    <section
      className="rounded-3xl border border-slate-800 bg-[#111827] p-5"
      data-testid="garage-mode-setting"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Display
          </h2>
          <p className="mt-2 text-sm font-medium text-white">Garage Mode</p>
          <p className="mt-1 text-sm text-slate-400">
            Higher contrast and larger type for bright garages and outdoor
            light. Optional — the current dark theme stays the default.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          data-testid="garage-mode-toggle"
          onClick={() => {
            const next = !on;
            setOn(next);
            applyGarageMode(next);
          }}
          className={`mt-1 inline-flex h-8 w-14 shrink-0 items-center rounded-full px-1 transition ${
            on ? "bg-cyan-400" : "bg-slate-700"
          }`}
        >
          <span
            className={`h-6 w-6 rounded-full bg-white transition ${
              on ? "translate-x-6" : "translate-x-0"
            }`}
          />
        </button>
      </div>
    </section>
  );
}
