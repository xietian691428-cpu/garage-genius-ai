"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Bluetooth } from "lucide-react";
import { useObdPreference } from "@/hooks/useObdPreference";

/**
 * Settings → Tools / Garage: optional OBD adapter ownership toggle.
 * Default off — hides Connect OBD / BLE until enabled.
 */
export default function ObdToolsSettings() {
  const { t } = useTranslation();
  const { pref, loading, setHasObdAdapter } = useObdPreference();
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(id);
  }, [toast]);

  async function toggle(next: boolean) {
    setSaving(true);
    setError(null);
    try {
      await setHasObdAdapter(next);
      setToast(t("obd.prefSaved"));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("obd.prefSaveFailed"),
      );
    } finally {
      setSaving(false);
    }
  }

  const checked = pref.hasObdAdapter === true;

  return (
    <section className="rounded-3xl border border-slate-800 bg-[#111827] p-5">
      <h2 className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
        <Bluetooth className="h-3.5 w-3.5" aria-hidden />
        {t("obd.toolsSectionTitle")}
      </h2>
      <p className="mt-2 text-sm text-slate-400">{t("obd.toolsSectionHint")}</p>

      {toast ? (
        <div
          className="mt-3 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-center text-xs font-medium text-cyan-200"
          role="status"
        >
          {toast}
        </div>
      ) : null}

      {loading ? (
        <p className="mt-4 text-sm text-slate-500">…</p>
      ) : (
        <div className="mt-4 space-y-3">
          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-700 bg-slate-950/60 px-4 py-3">
            <input
              type="checkbox"
              data-testid="settings-obd-toggle"
              className="mt-1 h-4 w-4 rounded border-slate-600 bg-slate-900 text-cyan-500 focus:ring-cyan-500/40"
              checked={checked}
              disabled={saving}
              onChange={(e) => void toggle(e.target.checked)}
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-white">
                {t("obd.prefToggleLabel")}
              </span>
              <span className="mt-1 block text-xs text-slate-400">
                {t("obd.prefToggleHelp")}
              </span>
            </span>
          </label>
          {!checked ? (
            <p className="text-[11px] text-slate-500">{t("obd.prefUnsetHint")}</p>
          ) : null}
          {error ? (
            <p className="text-xs text-rose-400" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}
