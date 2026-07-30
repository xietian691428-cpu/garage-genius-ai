"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useState } from "react";
import { ChatMessage, VehicleInfo, messageImages } from "@/lib/types/chat";
import { stripTrailingLegalDisclaimer } from "@/lib/legal-disclaimer";
import LiabilityDisclaimer from "@/components/legal/LiabilityDisclaimer";
import { stripPartsDataFromContent } from "@/lib/parse-ai-parts";
import { stripFocusFromContent } from "@/lib/parse-ai-focus";
import {
  Volume2,
  Crosshair,
  Copy,
  Check,
  RefreshCw,
  Pencil,
} from "lucide-react";
import { extractPartsData } from "@/lib/utils/parts";
import { extractFocusCommand, sanitizeFocusCommand } from "@/lib/parse-ai-focus";
import PartsRecommendationTable from "../parts/PartsRecommendationTable";
import { speakText, stopSpeaking } from "@/lib/browser-voice";
import { getFollowUpChips } from "@/lib/chat-repair-loop";

interface Props {
  message: ChatMessage;
  vehicle?: VehicleInfo;
  isLastAssistant?: boolean;
  onGoToInventory?: () => void;
  onOpenFocus?: (
    command: NonNullable<ReturnType<typeof extractFocusCommand>>,
  ) => void;
  onRegenerate?: () => void;
  onEditUser?: (content: string) => void;
  onQuickPrompt?: (prompt: string) => void;
}

export default function MessageBubble({
  message,
  vehicle,
  isLastAssistant = false,
  onGoToInventory,
  onOpenFocus,
  onRegenerate,
  onEditUser,
  onQuickPrompt,
}: Props) {
  const isUser = message.role === "user";
  const displayContent = isUser
    ? message.content
    : stripTrailingLegalDisclaimer(
        stripFocusFromContent(stripPartsDataFromContent(message.content)),
      );
  const partsData = !isUser ? extractPartsData(message.content) : null;
  const parts = messageImages(message);
  const focusCmd = !isUser
    ? sanitizeFocusCommand(extractFocusCommand(message.content), "focus.MessageBubble")
    : null;
  const [copied, setCopied] = useState(false);

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

  return (
    <div className={`mb-6 flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[90%] rounded-3xl px-5 py-4 sm:max-w-[80%] ${
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

        {!isUser && (
          <div className="mb-2 flex flex-wrap justify-end gap-1.5">
            <button
              type="button"
              onClick={() => void handleCopy()}
              className="inline-flex items-center gap-1.5 rounded-full bg-slate-900/80 px-2.5 py-1 text-[11px] text-slate-300 transition hover:bg-slate-900"
              title="Copy"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-cyan-300" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              {copied ? "Copied" : "Copy"}
            </button>
            {isLastAssistant && onRegenerate && (
              <button
                type="button"
                onClick={onRegenerate}
                className="inline-flex items-center gap-1.5 rounded-full bg-slate-900/80 px-2.5 py-1 text-[11px] text-slate-300 transition hover:bg-slate-900"
                title="Regenerate"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Regenerate
              </button>
            )}
            <button
              type="button"
              onClick={handleReplay}
              className="inline-flex items-center gap-1.5 rounded-full bg-slate-900/80 px-2.5 py-1 text-[11px] text-cyan-300 transition hover:bg-slate-900"
              aria-label="Read this reply aloud"
              title="Read aloud"
            >
              <Volume2 className="h-3.5 w-3.5" />
              Listen
            </button>
          </div>
        )}

        {isUser && onEditUser && (
          <div className="mb-2 flex justify-end">
            <button
              type="button"
              onClick={() => onEditUser(message.content)}
              className="inline-flex items-center gap-1.5 rounded-full bg-blue-700/80 px-2.5 py-1 text-[11px] text-blue-100 transition hover:bg-blue-700"
              title="Edit & resend"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </button>
          </div>
        )}

        <div className="chat-markdown prose prose-invert max-w-none text-[15px]">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {displayContent}
          </ReactMarkdown>
        </div>

        {!isUser && focusCmd && (
          <button
            type="button"
            onClick={() => onOpenFocus?.(focusCmd)}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-cyan-500/40 bg-cyan-500/10 py-3 text-sm font-medium text-cyan-300 transition hover:bg-cyan-500/20"
          >
            <Crosshair className="h-4 w-4" />
            Focus Mode — highlight {focusCmd.part} on map
          </button>
        )}

        {!isUser && partsData && partsData.length > 0 && (
          <PartsRecommendationTable
            parts={partsData}
            vehicle={vehicle}
            onGoToInventory={onGoToInventory}
          />
        )}

        {!isUser && isLastAssistant && onQuickPrompt && (
          <div className="mt-4 flex flex-wrap gap-2">
            {getFollowUpChips({
              focusPart: focusCmd?.part ?? null,
              assistantText: displayContent,
            }).map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() => onQuickPrompt(chip.prompt)}
                className="rounded-full border border-slate-600 bg-slate-900/70 px-3 py-1.5 text-left text-[11px] text-slate-200 transition hover:border-cyan-500/50 hover:text-cyan-200"
              >
                {chip.label}
              </button>
            ))}
          </div>
        )}

        {!isUser && <LiabilityDisclaimer variant="footer" />}

        <div
          className="mt-2 text-right text-[10px] text-slate-500"
          suppressHydrationWarning
        >
          {message.timestamp.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </div>
      </div>
    </div>
  );
}
