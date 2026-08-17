"use client";

import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ChatMessage, VehicleInfo } from "@/lib/types/chat";
import type { FocusCommand } from "@/lib/types/focus";
import MessageBubble from "./MessageBubble";
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
}: Props) {
  const { t } = useTranslation();
  const bottomRef = useRef<HTMLDivElement>(null);
  const showStarters =
    Boolean(onQuickPrompt) &&
    !isLoading &&
    messages.length > 0 &&
    messages.every((m) => m.id === "welcome" || m.role === "assistant") &&
    messages.filter((m) => m.role === "user").length === 0;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const lastAssistantId = [...messages]
    .reverse()
    .find((m) => m.role === "assistant" && m.id !== "welcome")?.id;

  return (
    <div className="chat-scroll flex-1 space-y-2 overflow-y-auto p-3 tech-grid sm:p-4 md:p-6">
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

      <div ref={bottomRef} aria-hidden className="h-px" />
    </div>
  );
}
