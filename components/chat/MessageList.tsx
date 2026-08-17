"use client";

import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ChatMessage, VehicleInfo } from "@/lib/types/chat";
import type { FocusCommand } from "@/lib/types/focus";
import type { SafetyTier } from "@/lib/safety-tier";
import MessageBubble from "./MessageBubble";
import SafetyTierTip from "@/components/legal/SafetyTierTip";
import { INSURANCE_SAFETY_COPY } from "@/lib/insurance-safety-copy";
import { getChatStarterChips } from "@/lib/chat-repair-loop";

interface Props {
  messages: ChatMessage[];
  isLoading: boolean;
  vehicle?: VehicleInfo;
  onGoToInventory?: () => void;
  onOpenFocus?: (command: FocusCommand) => void;
  onRegenerate?: () => void;
  onEditUser?: (content: string) => void;
  onQuickPrompt?: (prompt: string) => void;
  onGenerateShopReport?: () => void;
  sessionSafety?: { tier: SafetyTier; mods: boolean };
}

export default function MessageList({
  messages,
  isLoading,
  vehicle,
  onGoToInventory,
  onOpenFocus,
  onRegenerate,
  onEditUser,
  onQuickPrompt,
  onGenerateShopReport,
  sessionSafety,
}: Props) {
  const { t } = useTranslation();
  const listRef = useRef<HTMLDivElement>(null);
  const showStarters =
    Boolean(onQuickPrompt) &&
    !isLoading &&
    messages.length > 0 &&
    messages.every((m) => m.id === "welcome" || m.role === "assistant") &&
    messages.filter((m) => m.role === "user").length === 0;

  // Scroll only inside the message list — never scrollIntoView (that moves the page on iOS).
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, isLoading]);

  const lastAssistantId = [...messages]
    .reverse()
    .find((m) => m.role === "assistant" && m.id !== "welcome")?.id;

  return (
    <div
      ref={listRef}
      data-testid="chat-message-list"
      className="chat-scroll flex-1 space-y-2 overflow-y-auto overscroll-y-contain p-3 tech-grid sm:p-4 md:p-6"
      style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-y" }}
    >
      {messages.map((msg) => (
        <MessageBubble
          key={msg.id}
          message={msg}
          vehicle={vehicle}
          isLastAssistant={
            msg.role === "assistant" &&
            msg.id === lastAssistantId &&
            !isLoading
          }
          onGoToInventory={onGoToInventory}
          onOpenFocus={onOpenFocus}
          onRegenerate={
            msg.role === "assistant" && msg.id === lastAssistantId
              ? onRegenerate
              : undefined
          }
          onEditUser={msg.role === "user" ? onEditUser : undefined}
          onQuickPrompt={
            msg.role === "assistant" && msg.id === lastAssistantId
              ? onQuickPrompt
              : undefined
          }
          onGenerateShopReport={
            msg.role === "assistant" && msg.id === lastAssistantId
              ? onGenerateShopReport
              : undefined
          }
        />
      ))}

      {showStarters && (
        <div className="mx-auto max-w-xl px-1 pb-2">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
            {t("ai.tryStartingPoint")}
          </p>
          <div className="flex flex-wrap gap-2">
            {getChatStarterChips(vehicle).map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() => onQuickPrompt?.(chip.prompt)}
                className="rounded-2xl border border-slate-700 bg-slate-900/80 px-3 py-2 text-left text-sm text-slate-200 transition hover:border-cyan-500/40 hover:text-cyan-200"
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {isLoading && (
        <div
          className="flex justify-start"
          role="status"
          aria-live="polite"
          data-testid="chat-thinking"
        >
          <div className="rounded-3xl bg-slate-800 px-5 py-4">
            <div className="flex items-center gap-2 text-slate-300">
              <div className="h-2 w-2 animate-pulse rounded-full bg-cyan-400" />
              {t("ai.thinking")}
            </div>
          </div>
        </div>
      )}

      {/* Keep safety tip inside the scroll region so it never crushes the message list on phones. */}
      {sessionSafety &&
      (sessionSafety.tier !== "low" || sessionSafety.mods) &&
      messages.some((m) => m.role === "assistant") ? (
        <div
          className="mx-auto max-w-3xl border-t border-slate-800/80 px-1 pt-3"
          data-testid="chat-session-safety"
        >
          <p className="mb-1.5 text-[11px] text-slate-500">
            {INSURANCE_SAFETY_COPY.possibleFactorsOnly}{" "}
            {INSURANCE_SAFETY_COPY.nextStepOptions}
          </p>
          <SafetyTierTip
            tier={sessionSafety.tier}
            mods={sessionSafety.mods}
            onExportShopReport={onGenerateShopReport}
          />
        </div>
      ) : null}

      <div aria-hidden className="h-px" />
    </div>
  );
}
