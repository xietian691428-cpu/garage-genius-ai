"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Bluetooth } from "lucide-react";
import { useObdPreference } from "@/hooks/useObdPreference";

/**
 * Settings → Tools / Garage: optional OBD adapter ownership toggle.
 */
export default function ObdToolsSettings() {
  const { t } = useTranslation();
  const { pref, loading, setHasObdAdapter } = useObdPreference();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function toggle(next: boolean) {
    setSaving(true);
    setMessage(null);
    try {
      await setHasObdAdapter(next);
      setMessage(t("obd.prefSaved"));
    } catch (err) {
      setMessage(
        err instanceof Error ? err.message : t("obd.prefSaveFailed"),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-3xl border border-slate-800 bg-[#111827] p-5">
      <h2 className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
        <Bluetooth className="h-3.5 w-3.5" aria-hidden />
        {t("obd.toolsSectionTitle")}
      </h2>
      <p className="mt-2 text-sm text-slate-400">{t("obd.toolsSectionHint")}</p>

      {loading ? (
        <p className="mt-4 text-sm text-slate-500">…</p>
      ) : (
        <div className="mt-4 space-y-3">
          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-700 bg-slate-950/60 px-4 py-3">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 rounded border-slate-600 bg-slate-900 text-cyan-500 focus:ring-cyan-500/40"
              checked={pref.hasObdAdapter && !pref.preferenceUnset}
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
          {pref.preferenceUnset ? (
            <p className="text-[11px] text-slate-500">{t("obd.prefUnsetHint")}</p>
          ) : null}
          {message ? (
            <p className="text-xs text-slate-400">{message}</p>
          ) : null}
        </div>
      )}
    </section>
  );
}
