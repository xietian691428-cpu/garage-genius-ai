"use client";

import { useRef, useState } from "react";
import { Binary, Loader2, ScanLine } from "lucide-react";
import { useTranslation } from "react-i18next";
import DtcCodeModal from "@/components/chat/DtcCodeModal";
import { compressImageDataUrl } from "@/lib/image";

type Props = {
  disabled?: boolean;
  /** Compact row for Coach overlay vs Chat toolbar */
  variant?: "chat" | "coach";
  onCodeSubmit: (code: string) => void;
  onObdImage: (imageDataUrl: string) => void | Promise<void>;
};

/**
 * Shared “Enter fault code” + “OBD screenshot” entry (Chat + Check Engine coach).
 * Does not modify CoachScenarioPlayer internals.
 */
export default function DtcEntryBar({
  disabled,
  variant = "chat",
  onCodeSubmit,
  onObdImage,
}: Props) {
  const { t } = useTranslation();
  const [modalOpen, setModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const pickObd = () => {
    if (disabled || busy) return;
    fileRef.current?.click();
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    void (async () => {
      setBusy(true);
      try {
        const raw = await new Promise<string | null>((resolve) => {
          const reader = new FileReader();
          reader.onload = (ev) =>
            resolve((ev.target?.result as string) ?? null);
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(file);
        });
        if (!raw) return;
        const compressed = await compressImageDataUrl(raw, {
          maxWidth: 1600,
          maxHeight: 1600,
          quality: 0.85,
        });
        await onObdImage(compressed);
      } finally {
        setBusy(false);
      }
    })();
  };

  const wrap =
    variant === "coach"
      ? "flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-800 bg-[#0d1424] px-3 py-2"
      : "mb-2 flex flex-wrap gap-2";

  return (
    <>
      <DtcCodeModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={onCodeSubmit}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onFile}
      />
      <div className={wrap}>
        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => setModalOpen(true)}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-600 bg-slate-900/80 px-3 py-2 text-xs font-medium text-slate-200 transition hover:border-cyan-500/50 hover:text-cyan-200 disabled:opacity-50 sm:flex-none sm:text-sm"
        >
          <Binary className="h-3.5 w-3.5 text-cyan-400" />
          {t("dtc.enterCode")}
        </button>
        <button
          type="button"
          disabled={disabled || busy}
          onClick={pickObd}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-xs font-medium text-cyan-200 transition hover:bg-cyan-500/20 disabled:opacity-50 sm:flex-none sm:text-sm"
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ScanLine className="h-3.5 w-3.5" />
          )}
          {busy ? t("dtc.readingObd") : t("dtc.obdScreenshot")}
        </button>
      </div>
    </>
  );
}
