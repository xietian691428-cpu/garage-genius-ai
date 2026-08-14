"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Share2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { hideStorePurchaseUi } from "@/lib/native-platform";

/** Canonical share landing — marketing / install URL. */
export const APP_SHARE_URL = "https://garagegenius.cloud";

/**
 * Settings “Tell a friend” card.
 * Uses the system share sheet when available (iOS / Android / many desktop browsers);
 * otherwise copy-link + common social / email fallbacks Western users expect.
 */
export default function ShareAppCard() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<"idle" | "copied" | "shared" | "error">(
    "idle",
  );
  const [canNativeShare, setCanNativeShare] = useState(false);

  useEffect(() => {
    setCanNativeShare(typeof navigator.share === "function");
  }, []);

  const title = t("settings.shareTitle");
  const text = t(
    hideStorePurchaseUi() ? "settings.shareTextStore" : "settings.shareText",
  );

  async function shareNative() {
    setStatus("idle");
    const payload = { title, text, url: APP_SHARE_URL };

    try {
      if (
        typeof navigator !== "undefined" &&
        typeof navigator.share === "function"
      ) {
        await navigator.share(payload);
        setStatus("shared");
        return;
      }
      await copyLink();
    } catch (err) {
      // User cancelled the sheet — not an error
      if (err instanceof DOMException && err.name === "AbortError") return;
      try {
        await copyLink();
      } catch {
        setStatus("error");
      }
    }
  }

  async function copyLink() {
    await navigator.clipboard.writeText(APP_SHARE_URL);
    setStatus("copied");
    window.setTimeout(() => setStatus("idle"), 2500);
  }

  const encodedText = encodeURIComponent(`${text} ${APP_SHARE_URL}`);
  const encodedUrl = encodeURIComponent(APP_SHARE_URL);
  const encodedSubject = encodeURIComponent(title);

  const fallbacks = [
    {
      id: "x",
      label: "X",
      href: `https://twitter.com/intent/tweet?text=${encodedText}`,
    },
    {
      id: "facebook",
      label: "Facebook",
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
    },
    {
      id: "whatsapp",
      label: "WhatsApp",
      href: `https://wa.me/?text=${encodedText}`,
    },
    {
      id: "email",
      label: "Email",
      href: `mailto:?subject=${encodedSubject}&body=${encodedText}`,
    },
  ] as const;

  return (
    <section className="rounded-3xl border border-slate-800 bg-[#111827] p-5">
      <h2 className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {t("settings.shareSectionTitle")}
      </h2>
      <p className="mt-2 text-sm text-slate-400">{t("settings.shareHint")}</p>

      <button
        type="button"
        onClick={() => void shareNative()}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-cyan-500 px-4 py-3 text-sm font-semibold text-black hover:bg-cyan-400"
      >
        {status === "copied" ? (
          <Check className="h-4 w-4" aria-hidden />
        ) : (
          <Share2 className="h-4 w-4" aria-hidden />
        )}
        {status === "copied"
          ? t("settings.shareCopied")
          : status === "shared"
            ? t("settings.shareDone")
            : canNativeShare
              ? t("settings.shareCta")
              : t("settings.shareCopyCta")}
      </button>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void copyLink().catch(() => setStatus("error"))}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 px-3 py-2 text-xs font-medium text-slate-300 hover:border-cyan-500/40 hover:text-cyan-200"
        >
          <Copy className="h-3.5 w-3.5" aria-hidden />
          {t("settings.shareCopyLink")}
        </button>
        {fallbacks.map((item) => (
          <a
            key={item.id}
            href={item.href}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-xl border border-slate-700 px-3 py-2 text-xs font-medium text-slate-300 hover:border-cyan-500/40 hover:text-cyan-200"
          >
            {item.label}
          </a>
        ))}
      </div>

      {status === "error" ? (
        <p className="mt-2 text-xs text-rose-300">
          {t(
            hideStorePurchaseUi()
              ? "settings.shareErrorStore"
              : "settings.shareError",
          )}
        </p>
      ) : null}

      <p className="mt-3 truncate text-[11px] text-slate-500">{APP_SHARE_URL}</p>
    </section>
  );
}
