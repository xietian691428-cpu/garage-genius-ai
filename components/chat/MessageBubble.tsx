"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChatMessage, VehicleInfo, messageImages } from "@/lib/types/chat";
import { isPhotoPromptWithoutImages } from "@/lib/chat-empty-photo";
import { stripTrailingLegalDisclaimer } from "@/lib/legal-disclaimer";
import { stripPartsDataFromContent } from "@/lib/parse-ai-parts";
import { stripFocusFromContent } from "@/lib/parse-ai-focus";
import { stripGuideInjectForDisplay } from "@/lib/coach-guide-chat";
import {
  Volume2,
  Crosshair,
  Copy,
  Check,
  RefreshCw,
  Pencil,
  FileText,
  MoreHorizontal,
} from "lucide-react";
import { extractPartsData } from "@/lib/utils/parts";
import { extractFocusCommand, sanitizeFocusCommand } from "@/lib/parse-ai-focus";
import PartsRecommendationTable from "../parts/PartsRecommendationTable";
import { speakText, stopSpeaking } from "@/lib/browser-voice";
import {
  getFollowUpChips,
  selectConvergedFollowUps,
} from "@/lib/chat-repair-loop";
import HighRiskSafetyCallout from "./HighRiskSafetyCallout";
import { formatAppTime } from "@/lib/format-app-date";
import {
  matchSafetyTopics,
  type SafetyTopicHit,
} from "@/lib/safety-topics";
import { getActiveSafetyTopics } from "@/lib/safety-topics-remote";
import { detectReplyLanguageHint } from "@/lib/reply-language";

interface Props {
  message: ChatMessage;
  vehicle?: VehicleInfo;
  isLastAssistant?: boolean;
  /** Preceding user message — used for high-risk detection. */
  priorUserText?: string;
  onGoToInventory?: () => void;
  onOpenFocus?: (
    command: NonNullable<ReturnType<typeof extractFocusCommand>>,
  ) => void;
  onRegenerate?: () => void;
  onEditUser?: (content: string) => void;
  onQuickPrompt?: (prompt: string) => void;
  onOpenPlaybook?: (slug: string) => void;
  onGenerateShopReport?: () => void;
  onHideEmptyPhoto?: () => void;
}

const LONG_REPLY_CHARS = 1400;

export default function MessageBubble({
  message,
  vehicle,
  isLastAssistant = false,
  priorUserText = "",
  onGoToInventory,
  onOpenFocus,
  onRegenerate,
  onEditUser,
  onQuickPrompt,
  onOpenPlaybook,
  onGenerateShopReport,
  onHideEmptyPhoto,
}: Props) {
  const { t, i18n } = useTranslation();
  const isUser = message.role === "user";
  const displayContent = isUser
    ? stripGuideInjectForDisplay(message.content)
    : stripTrailingLegalDisclaimer(
        stripFocusFromContent(stripPartsDataFromContent(message.content)),
      );
  const partsData = !isUser ? extractPartsData(message.content) : null;
  const parts = messageImages(message);
  const focusCmd = !isUser
    ? sanitizeFocusCommand(
        extractFocusCommand(message.content),
        "focus.MessageBubble",
      )
    : null;
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const safetyHits: SafetyTopicHit[] = useMemo(() => {
    if (isUser || message.id === "welcome") return [];
    return matchSafetyTopics("", {
      topics: getActiveSafetyTopics(),
      userText: priorUserText,
      assistantText: displayContent,
      lang: detectReplyLanguageHint(priorUserText || displayContent),
    });
  }, [isUser, message.id, priorUserText, displayContent]);

  const isLong = !isUser && displayContent.length > LONG_REPLY_CHARS;
  const visibleContent =
    isLong && !expanded
      ? `${displayContent.slice(0, LONG_REPLY_CHARS).trimEnd()}…`
      : displayContent;

  const followUps = useMemo(() => {
    if (!isLastAssistant || !onQuickPrompt || isUser) return [];
    // Converged: max 2, safe-check path first; the first is the one primary CTA.
    return selectConvergedFollowUps(
      getFollowUpChips({
        focusPart: focusCmd?.part ?? null,
        assistantText: displayContent,
        userText: priorUserText,
        vehicle: vehicle ?? null,
      }),
      2,
    );
  }, [
    isLastAssistant,
    onQuickPrompt,
    isUser,
    focusCmd?.part,
    displayContent,
    priorUserText,
    vehicle,
  ]);

  const hasMore =
    !isUser && (isLastAssistant || Boolean(focusCmd && onOpenFocus));

  const handleReplay = () => {
    stopSpeaking();
    speakText(displayContent);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(displayContent);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  if (isUser && isPhotoPromptWithoutImages(message.content, parts)) {
    return (
      <div className="mb-3 flex justify-end">
        <div
          data-testid="chat-empty-photo-hint"
          className="flex max-w-[92%] items-center gap-2 rounded-2xl bg-slate-800/80 px-3 py-2 text-xs text-slate-400"
        >
          <span>Photo prompt with no picture attached.</span>
          {onHideEmptyPhoto ? (
            <button
              type="button"
              data-testid="chat-empty-photo-hide"
              onClick={onHideEmptyPhoto}
              className="shrink-0 font-medium text-slate-300 underline-offset-2 hover:text-cyan-300 hover:underline"
            >
              Hide
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`mb-4 flex flex-col ${isUser ? "items-end" : "items-start"}`}
    >
      <div
      className={`max-w-[min(36rem,92%)] rounded-3xl px-4 py-3.5 sm:px-5 sm:py-4 ${
          isUser ? "bg-blue-600" : "bg-slate-800"
        }`}
      >
        {parts.length > 0 && (
          <div
            className={`mb-3 grid gap-2 ${
              parts.length > 1 ? "grid-cols-2" : "grid-cols-1"
            }`}
          >
            {parts.map((src, idx) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={`${message.id}-img-${idx}`}
                src={src}
                alt={`Vehicle photo ${idx + 1}`}
                className="max-h-56 w-full rounded-2xl object-cover"
              />
            ))}
          </div>
        )}

        {!isUser && message.imageAnalysis ? (
          <details
            className="mb-3 rounded-xl border border-slate-700/80 bg-slate-900/60 px-3 py-2"
            data-testid="image-recognition-summary"
          >
            <summary className="cursor-pointer text-xs font-medium text-cyan-300">
              Image recognition summary
            </summary>
            <div className="mt-2 space-y-1 text-[11px] leading-relaxed text-slate-300">
              <p>
                {message.imageAnalysis.condition} · confidence{" "}
                {Math.round(message.imageAnalysis.confidence * 100)}% ·{" "}
                {message.imageAnalysis.scene.replace(/_/g, " ")}
              </p>
              {message.imageAnalysis.dtc_codes.length > 0 ? (
                <p>Codes: {message.imageAnalysis.dtc_codes.join(", ")}</p>
              ) : null}
              {message.imageAnalysis.objects.length > 0 ? (
                <p>Visible: {message.imageAnalysis.objects.join(", ")}</p>
              ) : null}
              {message.imageAnalysis.notes ? (
                <p>{message.imageAnalysis.notes}</p>
              ) : null}
              {message.imageAnalysis.askRetake ? (
                <p className="text-amber-200">
                  Photo looks unclear — retake in better light if you can. Do not
                  treat guessed readings as facts.
                </p>
              ) : null}
            </div>
          </details>
        ) : null}

        {isUser && onEditUser && (
          <div className="mb-2 flex justify-end">
            <button
              type="button"
              onClick={() => onEditUser(displayContent)}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full bg-blue-700/80 px-2.5 py-1 text-[11px] text-blue-100 transition hover:bg-blue-700"
              title="Edit & resend"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </button>
          </div>
        )}

        <div className="chat-markdown prose prose-invert max-w-none text-[15px]">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {visibleContent}
          </ReactMarkdown>
        </div>

        {isLong && (
          <button
            type="button"
            data-testid="chat-reply-show-more"
            onClick={() => setExpanded((v) => !v)}
            className="mt-2 text-xs font-medium text-cyan-300 hover:text-cyan-200"
          >
            {expanded ? "Show less" : "Show more"}
          </button>
        )}

        {safetyHits.length > 0 && <HighRiskSafetyCallout hits={safetyHits} />}

        {!isUser && partsData && partsData.length > 0 && (
          <PartsRecommendationTable
            parts={partsData}
            vehicle={vehicle}
            onGoToInventory={onGoToInventory}
          />
        )}

        {/*
          Action convergence: the single primary CTA lives under the bubble
          (first follow-up chip). Everything else — Copy, Retry, Shop Report,
          Listen, map highlight — sits behind one "More" toggle.
        */}
        <div className="mt-2 flex items-center justify-end gap-2">
          {hasMore && (
            <button
              type="button"
              data-testid="chat-more-actions"
              aria-expanded={moreOpen}
              aria-controls={`msg-more-${message.id}`}
              onClick={() => setMoreOpen((v) => !v)}
              className="inline-flex min-h-[32px] items-center gap-1 rounded-full bg-slate-900/70 px-2.5 py-1 text-[11px] text-slate-400 transition hover:bg-slate-900 hover:text-slate-200"
              title="More actions"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
              More
            </button>
          )}
          <span
            className="text-[10px] text-slate-500"
            suppressHydrationWarning
          >
            {formatAppTime(message.timestamp, i18n.language)}
          </span>
        </div>

        {hasMore && moreOpen && (
          <div
            id={`msg-more-${message.id}`}
            data-testid="chat-more-actions-row"
            className="mt-2 flex flex-wrap justify-end gap-1.5"
          >
            {focusCmd && onOpenFocus && (
              <button
                type="button"
                onClick={() => onOpenFocus(focusCmd)}
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full bg-slate-900/80 px-2.5 py-1 text-[11px] text-cyan-300 transition hover:bg-slate-900"
                title={`Highlight ${focusCmd.part} on the map`}
              >
                <Crosshair className="h-3.5 w-3.5" />
                Show {focusCmd.part} on map
              </button>
            )}
            {isLastAssistant && onGenerateShopReport && (
              <button
                type="button"
                onClick={onGenerateShopReport}
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full bg-slate-900/80 px-2.5 py-1 text-[11px] text-cyan-300 transition hover:bg-slate-900"
                title={t("shopReport.openCta")}
              >
                <FileText className="h-3.5 w-3.5" />
                {t("shopReport.openShort")}
              </button>
            )}
            {isLastAssistant && (
            <>
            <button
              type="button"
              onClick={() => void handleCopy()}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full bg-slate-900/80 px-2.5 py-1 text-[11px] text-slate-300 transition hover:bg-slate-900"
              title="Copy"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-cyan-300" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              {copied ? "Copied" : "Copy"}
            </button>
            <button
              type="button"
              onClick={handleReplay}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full bg-slate-900/80 px-2.5 py-1 text-[11px] text-slate-300 transition hover:bg-slate-900"
              aria-label="Read this reply aloud"
              title="Read aloud"
            >
              <Volume2 className="h-3.5 w-3.5" />
              Listen
            </button>
            </>
            )}
            {isLastAssistant && onRegenerate && (
              <button
                type="button"
                onClick={() => {
                  setMoreOpen(false);
                  onRegenerate();
                }}
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full bg-slate-900/80 px-2.5 py-1 text-[11px] text-slate-300 transition hover:bg-slate-900"
                title="Regenerate"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Retry
              </button>
            )}
          </div>
        )}
      </div>
      {followUps.length > 0 && (
        <div
          data-testid="chat-follow-up-chips"
          className="mt-2 flex max-w-[92%] flex-wrap items-center gap-2 pb-1 sm:max-w-[80%]"
        >
          {followUps.map((chip, i) => (
            <button
              key={chip.id}
              type="button"
              data-testid={i === 0 ? "chat-primary-cta" : "chat-secondary-chip"}
              onClick={() => {
                if (chip.playbookSlug && onOpenPlaybook) {
                  onOpenPlaybook(chip.playbookSlug);
                  return;
                }
                onQuickPrompt?.(chip.prompt);
              }}
              className={
                i === 0
                  ? "min-h-[44px] touch-manipulation rounded-full bg-cyan-500 px-4 py-2 text-[13px] font-semibold text-black shadow-sm transition hover:bg-cyan-400"
                  : "min-h-[36px] touch-manipulation rounded-full border border-slate-700 bg-transparent px-3 py-1.5 text-[12px] text-slate-400 transition hover:border-cyan-500/50 hover:text-cyan-200"
              }
            >
              {chip.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
