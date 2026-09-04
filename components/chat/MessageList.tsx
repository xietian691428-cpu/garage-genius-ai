"use client";

import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ChatMessage, VehicleInfo } from "@/lib/types/chat";
import type { FocusCommand } from "@/lib/types/focus";
import type { SafetyTier } from "@/lib/safety-tier";
import MessageBubble from "./MessageBubble";
import ChatDisclaimerBanner from "./ChatDisclaimerBanner";
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
  onOpenPlaybook?: (slug: string) => void;
  onGenerateShopReport?: () => void;
  onHideEmptyPhoto?: (id: string) => void;
  /** @deprecated kept for callers; elevated tip lives in Safety notes sheet */
  sessionSafety?: { tier: SafetyTier; mods: boolean };
  showDisclaimerBanner?: boolean;
  disclaimerMode?: "first" | "interval";
  onDisclaimerGotIt?: () => void;
  onDisclaimerLearnMore?: () => void;
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
  onOpenPlaybook,
  onGenerateShopReport,
  onHideEmptyPhoto,
  showDisclaimerBanner = false,
  disclaimerMode = "first",
  onDisclaimerGotIt,
  onDisclaimerLearnMore,
}: Props) {
  const { t } = useTranslation();
  const listRef = useRef<HTMLDivElement>(null);
  const showStarters =
    Boolean(onQuickPrompt) &&
    !isLoading &&
    messages.length > 0 &&
    messages.every((m) => m.id === "welcome" || m.role === "assistant") &&
    messages.filter((m) => m.role === "user").length === 0;

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, isLoading, showDisclaimerBanner]);

  const lastAssistantId = [...messages]
    .reverse()
    .find((m) => m.role === "assistant" && m.id !== "welcome")?.id;

  const starterChips = showStarters
    ? getChatStarterChips(vehicle).slice(0, 5)
    : [];

  return (
    <div
      ref={listRef}
      data-testid="chat-message-list"
      className="chat-scroll flex-1 space-y-1 overflow-y-auto overscroll-y-contain p-3 tech-grid sm:p-4 md:p-6"
      style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-y" }}
    >
      {showDisclaimerBanner && onDisclaimerGotIt && onDisclaimerLearnMore ? (
        <ChatDisclaimerBanner
          mode={disclaimerMode}
          onGotIt={onDisclaimerGotIt}
          onLearnMore={onDisclaimerLearnMore}
        />
      ) : null}

      {messages.map((msg, idx) => {
        const priorUser =
          msg.role === "assistant"
            ? [...messages.slice(0, idx)]
                .reverse()
                .find((m) => m.role === "user")?.content ?? ""
            : "";
        return (
          <MessageBubble
            key={msg.id}
            message={msg}
            vehicle={vehicle}
            priorUserText={priorUser}
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
            onOpenPlaybook={
              msg.role === "assistant" && msg.id === lastAssistantId
                ? onOpenPlaybook
                : undefined
            }
            onGenerateShopReport={
              msg.role === "assistant" && msg.id === lastAssistantId
                ? onGenerateShopReport
                : undefined
            }
            onHideEmptyPhoto={
              msg.role === "user"
                ? () => onHideEmptyPhoto?.(msg.id)
                : undefined
            }
          />
        );
      })}

      {starterChips.length > 0 && (
        <div className="mx-auto max-w-xl px-1 pb-2" data-testid="chat-starter-chips">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
            {t("ai.tryStartingPoint")}
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {starterChips.map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() => onQuickPrompt?.(chip.prompt)}
                className="min-h-[44px] shrink-0 rounded-2xl border border-slate-700 bg-slate-900/80 px-3 py-2 text-left text-sm text-slate-200 transition hover:border-cyan-500/40 hover:text-cyan-200"
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

      <div aria-hidden className="h-px" />
    </div>
  );
}
