"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { isValidDtcInput, normalizeDtcCode } from "@/lib/dtc";
import { useBodyScrollLock } from "@/lib/hooks/useBodyScrollLock";

type Props = {
  open: boolean;
  onClose: () => void;
  onSubmit: (code: string) => void;
};

/**
 * Manual OBD-II fault code entry (P/C/B/U + 4 hex digits).
 */
export default function DtcCodeModal({ open, onClose, onSubmit }: Props) {
  const { t } = useTranslation();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useBodyScrollLock(open);

  useEffect(() => {
    if (!open) return;
    setValue("");
    setError(null);
    window.setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  if (!open) return null;

  const submit = () => {
    const code = normalizeDtcCode(value);
    if (!code || !isValidDtcInput(value)) {
      setError(t("dtc.invalidCode"));
      return;
    }
    onSubmit(code);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="dtc-modal-title"
        className="w-full max-w-md rounded-2xl border border-slate-700 bg-[#111827] p-4 shadow-xl"
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <h2
              id="dtc-modal-title"
              className="text-base font-semibold text-white"
            >
              {t("dtc.enterTitle")}
            </h2>
            <p className="mt-1 text-xs text-slate-400">{t("dtc.enterHint")}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
            aria-label={t("common.cancel")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <input
          ref={inputRef}
          value={value}
          onChange={(e) => {
            setValue(e.target.value.toUpperCase().replace(/[^PCBU0-9A-F]/gi, "").slice(0, 5));
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={t("dtc.placeholder")}
          className="mb-2 w-full rounded-xl border border-slate-600 bg-slate-950 px-3 py-3 font-mono text-lg tracking-wider text-cyan-200 placeholder:text-slate-600 focus:border-cyan-500 focus:outline-none"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          inputMode="text"
        />
        {error ? (
          <p className="mb-2 text-xs text-red-400">{error}</p>
        ) : (
          <p className="mb-2 text-[11px] text-slate-500">{t("dtc.formatHelp")}</p>
        )}

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-slate-700 px-3 py-2.5 text-sm text-slate-300 hover:bg-slate-900"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={submit}
            className="flex-1 rounded-xl bg-cyan-500 px-3 py-2.5 text-sm font-semibold text-black hover:bg-cyan-400"
          >
            {t("dtc.submit")}
          </button>
        </div>
      </div>
    </div>
  );
}
