"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { ChatMessage, VehicleInfo } from "@/lib/types/chat";
import { createWelcomeMessage } from "@/lib/constants";
import { loadChatMessages, saveCurrentVehicleId } from "@/lib/chat-storage";
import { chatCloudService, resolveLoadedChat } from "@/lib/chat-cloud";
import { FREE_CHAT_MESSAGE_LIMIT } from "@/lib/history-limits";
import { formatVehicleYmmMarket } from "@/lib/types/vehicle-market";
import VehicleManager from "../vehicles/VehicleManager";
import MobileVehicleSwitcher from "../vehicles/MobileVehicleSwitcher";
import VehiclePanel from "./VehiclePanel";
import MessageList from "./MessageList";
import ChatInput from "./ChatInput";
import { toBase64DataUrl } from "@/lib/image";
import { stripPartsDataFromContent } from "@/lib/parse-ai-parts";
import { stripFocusFromContent } from "@/lib/parse-ai-focus";
import {
  loadAutoSpeakPreference,
  speakText,
  stopSpeaking,
} from "@/lib/browser-voice";
import { supabase } from "@/lib/supabase";
import { useTokenUsage } from "@/hooks/useTokenUsage";
import { useSubscription } from "@/hooks/useSubscription";
import UpgradeButton from "@/components/ui/UpgradeButton";
import { extractFocusCommand, resolveFocusCommand, sanitizeFocusCommand } from "@/lib/parse-ai-focus";
import type { FocusCommand } from "@/lib/types/focus";
import type { RagKnowledgeHit } from "@/lib/types/rag";
import { maintenanceService } from "@/lib/maintenance-records";
import { useTranslation } from "react-i18next";
import {
  formatMaintenanceHistoryForPrompt,
  trimMessagesForApi,
} from "@/lib/chat-repair-loop";
import {
  computeVehicleFamiliarity,
  formatFamiliarityForPrompt,
} from "@/lib/vehicle-familiarity";
import ReceiptConfirmModal from "@/components/history/ReceiptConfirmModal";
import SafetyTierTip from "@/components/legal/SafetyTierTip";
import {
  combineSafetyTiers,
  inferSafetyTierFromText,
  safetyTierForPlaybook,
} from "@/lib/safety-tier";
import { vehicleHasModifiedTag } from "@/lib/insurance-tips";
import { MOD_CONTEXT_PATTERN } from "@/lib/insurance-safety-copy";
import { INSURANCE_SAFETY_COPY } from "@/lib/insurance-safety-copy";
import ShopReportModal from "@/components/shop-report/ShopReportModal";
import { formatAiHttpError } from "@/lib/format-ai-http-error";
import type { MaintenanceRecord } from "@/lib/types/maintenance";
import {
  buildDtcDiagnosisPrompt,
  buildObdBleDiagnosisPrompt,
  extractDtcCodes,
  lookupDtc,
  lookupDtcsFromText,
} from "@/lib/dtc";
import type { ObdVisionAnalysis } from "@/lib/types/dtc";
import type { ObdSessionSnapshot } from "@/lib/types/obd-session";
import { FileText } from "lucide-react";

interface Props {
  seedPrompt?: string;
  /** Optional photos to attach with seedPrompt (Dashboard camera → Chat) */
  seedImages?: string[];
  /** Coach playbook slug for token analytics attribution */
  playbookSlug?: string | null;
  onPromptUsed?: () => void;
  onGoToInventory?: () => void;
  onFocusDetected?: (command: FocusCommand) => void;
  /** Shared garage from useVehicles (cloud) */
  vehicles: VehicleInfo[];
  currentVehicle: VehicleInfo | null;
  vehiclesLoading?: boolean;
  onVehicleChange: (vehicle: VehicleInfo) => void | Promise<void>;
  onAddVehicle: (vehicle: VehicleInfo) => Promise<VehicleInfo>;
  onUpdateVehicle?: (vehicle: VehicleInfo) => Promise<VehicleInfo>;
  /** Local garage merge after server already wrote (OBD mileage sync). */
  onMergeVehicleLocal?: (
    vehicleId: string,
    patch: Partial<VehicleInfo>,
  ) => void;
  onArchiveVehicle?: (vehicle: VehicleInfo) => Promise<void>;
  onRemoveVehicle?: (vehicle: VehicleInfo) => Promise<void>;
}

export default function ChatApp({
  seedPrompt,
  seedImages,
  playbookSlug = null,
  onPromptUsed,
  onGoToInventory,
  onFocusDetected,
  vehicles,
  currentVehicle,
  vehiclesLoading = false,
  onVehicleChange,
  onAddVehicle,
  onUpdateVehicle,
  onMergeVehicleLocal,
  onArchiveVehicle,
  onRemoveVehicle,
}: Props) {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showVehicleSwitcher, setShowVehicleSwitcher] = useState(false);
  const [ready, setReady] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [draftValue, setDraftValue] = useState<string | undefined>();
  const [maintenanceSummary, setMaintenanceSummary] = useState<string>("");
  const [receiptModalOpen, setReceiptModalOpen] = useState(false);
  const [shopReportOpen, setShopReportOpen] = useState(false);
  const [maintenanceTick, setMaintenanceTick] = useState(0);
  const [requestError, setRequestError] = useState<string | null>(null);
  const seedSentRef = useRef<string | null>(null);
  const lastSpokenIdRef = useRef<string | null>(null);
  const shouldSpeakNextAssistantRef = useRef(false);
  const skipNextPersistRef = useRef(false);
  const loadGenRef = useRef(0);
  const loadedKeyRef = useRef<string | null>(null);
  const playbookSlugRef = useRef<string | null>(playbookSlug ?? null);
  const abortRef = useRef<AbortController | null>(null);
  const stoppedByUserRef = useRef(false);
  const messagesRef = useRef<ChatMessage[]>([]);
  const { refresh: refreshTokenUsage } = useTokenUsage();
  const { isFree, isPro, features } = useSubscription();
  const sessionSafety = useMemo(() => {
    const recent = messages
      .slice(-6)
      .map((m) => m.content || "")
      .join("\n");
    const fromText = inferSafetyTierFromText(recent);
    const fromPlaybook = safetyTierForPlaybook(playbookSlugRef.current);
    const tier = combineSafetyTiers(fromText, fromPlaybook);
    const mods =
      vehicleHasModifiedTag(currentVehicle) || MOD_CONTEXT_PATTERN.test(recent);
    return { tier, mods };
  }, [messages, currentVehicle]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    if (playbookSlug) playbookSlugRef.current = playbookSlug;
  }, [playbookSlug]);

  // One-time localStorage → Supabase migrate once garage UUIDs exist
  useEffect(() => {
    if (vehiclesLoading || vehicles.length === 0) return;
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      try {
        await chatCloudService.migrateLocalIfNeeded(
          user.id,
          vehicles.map((v) => v.id),
        );
      } catch (err) {
        console.warn("[ChatApp] chat migrate:", err);
      }
    })();
  }, [vehiclesLoading, vehicles]);

  // Load cloud chat when vehicle or plan window changes
  useEffect(() => {
    if (vehiclesLoading) return;
    if (!currentVehicle) {
      setMessages([createWelcomeMessage()]);
      setReady(true);
      loadedKeyRef.current = null;
      return;
    }

    const vehicleId = currentVehicle.id;
    const loadKey = `${vehicleId}:${isPro ? "pro" : "free"}`;
    if (loadedKeyRef.current === loadKey) return;

    const gen = ++loadGenRef.current;
    let cancelled = false;

    void (async () => {
      setReady(false);
      skipNextPersistRef.current = true;
      let cloud: ChatMessage[] | null = null;
      let cloudFailed = false;
      try {
        cloud = await chatCloudService.load(vehicleId, { isPro });
      } catch (err) {
        cloudFailed = true;
        console.warn("[ChatApp] cloud load failed, using local cache:", err);
      }
      if (cancelled || loadGenRef.current !== gen) return;
      const resolved = resolveLoadedChat({
        cloud,
        local: loadChatMessages(vehicleId),
        cloudFailed,
        welcome: createWelcomeMessage(),
      });
      skipNextPersistRef.current = resolved.skipPersist;
      setMessages(resolved.messages);
      if (!cancelled && loadGenRef.current === gen) {
        loadedKeyRef.current = loadKey;
        setAutoSpeak(loadAutoSpeakPreference(true));
        setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [vehiclesLoading, currentVehicle, isPro]);

  useEffect(() => {
    if (!ready || !autoSpeak || isLoading) return;
    if (!shouldSpeakNextAssistantRef.current) return;

    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant") return;
    if (lastSpokenIdRef.current === last.id) return;

    shouldSpeakNextAssistantRef.current = false;
    lastSpokenIdRef.current = last.id;
    speakText(stripFocusFromContent(stripPartsDataFromContent(last.content)));
  }, [messages, autoSpeak, isLoading, ready]);

  useEffect(() => {
    if (!features.voiceEnabled && autoSpeak) {
      setAutoSpeak(false);
      stopSpeaking();
    }
  }, [features.voiceEnabled, autoSpeak]);

  // Load recent maintenance for multi-turn system context
  useEffect(() => {
    if (!currentVehicle?.id || vehiclesLoading) {
      setMaintenanceSummary("");
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const { records, truncated, total } = await maintenanceService.list({
          vehicleId: currentVehicle.id,
          isPro,
        });
        if (cancelled) return;
        const familiarity = computeVehicleFamiliarity(records, total);
        setMaintenanceSummary(
          formatMaintenanceHistoryForPrompt(records, {
            truncated,
            total,
            familiarityBlock: formatFamiliarityForPrompt(familiarity),
          }),
        );
      } catch (err) {
        console.warn("[ChatApp] maintenance context:", err);
        if (!cancelled) setMaintenanceSummary("");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentVehicle?.id, isPro, vehiclesLoading, maintenanceTick]);

  const refreshMaintenanceContext = () => {
    setMaintenanceTick((n) => n + 1);
  };

  const handleReceiptSaved = (record: MaintenanceRecord) => {
    refreshMaintenanceContext();
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `✅ **${record.title}** (${record.performedAt.slice(0, 10)}${
          record.mileage != null
            ? ` · ${Number(record.mileage).toLocaleString()} mi`
            : ""
        }) — ${t("history.savedToHistory")}`,
        timestamp: new Date(),
      },
    ]);
  };

  // Persist to Supabase (debounced) + local mirror
  useEffect(() => {
    if (!ready || !currentVehicle || messages.length === 0) return;
    if (skipNextPersistRef.current) {
      skipNextPersistRef.current = false;
      return;
    }

    const vehicleId = currentVehicle.id;
    const snapshot = messages;
    const timer = window.setTimeout(() => {
      void chatCloudService
        .save(vehicleId, snapshot, { isPro })
        .catch((err) => console.warn("[ChatApp] cloud save:", err));
    }, 450);

    return () => window.clearTimeout(timer);
  }, [messages, currentVehicle, ready, isPro]);

  useEffect(() => {
    if (!seedPrompt?.trim()) {
      seedSentRef.current = null;
      return;
    }
    const seedKey = `${seedPrompt}::${(seedImages ?? []).length}`;
    if (
      !ready ||
      vehiclesLoading ||
      !currentVehicle ||
      seedSentRef.current === seedKey
    ) {
      return;
    }

    seedSentRef.current = seedKey;

    void (async () => {
      await handleSend(
        seedPrompt,
        seedImages?.length ? seedImages : undefined,
      );
      onPromptUsed?.();
    })();
  }, [
    seedPrompt,
    seedImages,
    ready,
    vehiclesLoading,
    currentVehicle,
    onPromptUsed,
  ]);

  const persistNow = async (vehicleId: string, msgs: ChatMessage[]) => {
    try {
      await chatCloudService.save(vehicleId, msgs, { isPro });
    } catch (err) {
      console.warn("[ChatApp] flush save:", err);
    }
  };

  const handleVehicleChange = async (vehicle: VehicleInfo) => {
    if (currentVehicle) {
      await persistNow(currentVehicle.id, messages);
    }
    await onVehicleChange(vehicle);
    saveCurrentVehicleId(vehicle.id);
    // load effect will run for new vehicle id
  };

  const handleAddVehicle = async (newVehicle: VehicleInfo) => {
    if (!features.canAddVehicle(vehicles.length)) {
      alert(t("vehicles.planLimit", { count: features.maxVehicles }));
      return;
    }

    if (currentVehicle) {
      await persistNow(currentVehicle.id, messages);
    }
    try {
      await onAddVehicle(newVehicle);
      // load effect picks up new current vehicle
    } catch (err) {
      console.error("[ChatApp] add vehicle failed:", err);
      alert(
        err instanceof Error
          ? err.message
          : "Could not save vehicle to your garage. Please try again.",
      );
    }
  };

  const handleUpdateVehicle = async (vehicle: VehicleInfo) => {
    if (!onUpdateVehicle) return;
    try {
      await onUpdateVehicle(vehicle);
    } catch (err) {
      console.error("[ChatApp] update vehicle failed:", err);
      alert(
        err instanceof Error
          ? err.message
          : "Could not update vehicle. Please try again.",
      );
    }
  };

  const handleStop = () => {
    stoppedByUserRef.current = true;
    abortRef.current?.abort();
    abortRef.current = null;
    setIsLoading(false);
    stopSpeaking();
  };

  const runChatRequest = async (
    nextMessages: ChatMessage[],
    photoList: string[],
  ) => {
    if (!currentVehicle) {
      alert("Add a vehicle to your garage before chatting.");
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    stoppedByUserRef.current = false;

    shouldSpeakNextAssistantRef.current = Boolean(
      autoSpeak && features.voiceEnabled,
    );
    setIsLoading(true);
    setRequestError(null);

    const CLIENT_TIMEOUT_MS = 90_000;
    const timeoutId = window.setTimeout(() => {
      if (abortRef.current === controller && !stoppedByUserRef.current) {
        controller.abort();
      }
    }, CLIENT_TIMEOUT_MS);

    try {
      const imagePayloads: string[] = [];
      for (const img of photoList) {
        imagePayloads.push(
          img.startsWith("data:") ? img : await toBase64DataUrl(img),
        );
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) {
        throw new Error(t("ai.signInRequired"));
      }

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          messages: trimMessagesForApi(nextMessages, undefined, {
            imageHeavy: imagePayloads.length > 0,
          }),
          images: imagePayloads,
          image: imagePayloads[0],
          currentVehicle,
          playbookSlug: playbookSlugRef.current || undefined,
          maintenanceSummary: maintenanceSummary || undefined,
        }),
      });

      let data: {
        content?: string;
        error?: string;
        code?: string;
        retryable?: boolean;
        suggestedFocus?: FocusCommand | null;
        ragHits?: RagKnowledgeHit[];
      };
      try {
        data = (await response.json()) as typeof data;
      } catch {
        throw new Error(
          response.ok
            ? t("ai.emptyReply")
            : t("ai.requestFailed"),
        );
      }

      if (!response.ok) {
        throw new Error(
          formatAiHttpError({
            status: response.status,
            code: data.code,
            error: data.error,
            fallback: t("ai.requestFailed"),
            rateLimitFallback: t("ai.rateLimited"),
            reportLimitFallback: t("shopReport.limitReached"),
          }),
        );
      }

      if (!data.content?.trim()) {
        throw new Error(t("ai.emptyReply"));
      }

      const assistantContent = data.content.trim();
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: assistantContent,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
      setRequestError(null);
      void refreshTokenUsage();

      const focus = sanitizeFocusCommand(
        data.suggestedFocus ||
          resolveFocusCommand(assistantContent, data.ragHits) ||
          extractFocusCommand(assistantContent),
        "focus.ChatApp",
      );
      if (focus && onFocusDetected) {
        onFocusDetected(focus);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        if (stoppedByUserRef.current) {
          setMessages((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              role: "assistant",
              content: t("ai.stopped"),
              timestamp: new Date(),
            },
          ]);
        } else {
          const msg = t("ai.timeout");
          setRequestError(msg);
          setMessages((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              role: "assistant",
              content: `⚠️ ${msg}`,
              timestamp: new Date(),
            },
          ]);
        }
        return;
      }
      const message =
        err instanceof Error ? err.message : t("ai.requestFailed");
      setRequestError(message);
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `⚠️ ${message}`,
          timestamp: new Date(),
        },
      ]);
    } finally {
      window.clearTimeout(timeoutId);
      if (abortRef.current === controller) abortRef.current = null;
      setIsLoading(false);
    }
  };

  const vehicleLabel = currentVehicle
    ? `${currentVehicle.year} ${currentVehicle.make} ${currentVehicle.model}`
    : undefined;

  /** Expand a short message that is mostly just DTC codes into a diagnosis prompt. */
  const expandDtcIfNeeded = (content: string): string => {
    if (content.includes("Please diagnose with this structure")) return content;
    const hit = lookupDtcsFromText(content);
    if (!hit.codes.length) return content;
    const stripped = content
      .replace(/\b([PCBU])([0-9A-Fa-f]{4})\b/g, "")
      .replace(/[,;\s]+/g, " ")
      .trim();
    if (stripped.length > 48) return content;
    return buildDtcDiagnosisPrompt({
      codes: hit.codes,
      source: "chat_text",
      vehicleLabel,
    });
  };

  const handleSend = async (content: string, images?: string[]) => {
    if (isLoading) return;
    if (!currentVehicle) {
      alert("Add a vehicle to your garage before chatting.");
      return;
    }

    const photoList = (images ?? []).filter(Boolean).slice(0, 4);
    const finalContent = expandDtcIfNeeded(content.trim());
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: finalContent,
      image: photoList[0],
      images: photoList.length ? photoList : undefined,
      timestamp: new Date(),
    };

    const nextMessages = [...messagesRef.current, userMessage];
    setMessages(nextMessages);
    await runChatRequest(nextMessages, photoList);
  };

  const handleFaultCode = (code: string) => {
    const parsed = lookupDtc(code);
    void handleSend(
      buildDtcDiagnosisPrompt({
        codes: [parsed],
        source: "manual",
        vehicleLabel,
      }),
    );
  };

  const handleObdBleSession = (snapshot: ObdSessionSnapshot) => {
    void handleSend(
      buildObdBleDiagnosisPrompt({
        deviceName: snapshot.deviceName,
        codes: snapshot.codes,
        vehicleLabel,
        sensors: snapshot.sensors,
        odometerKm: snapshot.odometerKm,
        distanceSinceCodesClearedKm: snapshot.distanceSinceCodesClearedKm,
      }),
    );
  };

  const handleObdScreenshot = async (imageDataUrl: string) => {
    if (!currentVehicle) {
      alert("Add a vehicle to your garage before chatting.");
      return;
    }
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      alert(t("ai.signInRequired"));
      return;
    }

    setIsLoading(true);
    setRequestError(null);
    try {
      const res = await fetch("/api/vision/analyze-obd", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          image: imageDataUrl,
          vehicle: {
            year: currentVehicle.year,
            make: currentVehicle.make,
            model: currentVehicle.model,
            market: currentVehicle.market,
            engine: currentVehicle.engine,
          },
        }),
      });
      let json: {
        success?: boolean;
        data?: ObdVisionAnalysis;
        codes?: ObdVisionAnalysis["codes"];
        error?: string;
      };
      try {
        json = (await res.json()) as typeof json;
      } catch {
        throw new Error(t("ai.requestFailed"));
      }
      if (!res.ok) {
        throw new Error(
          formatAiHttpError({
            status: res.status,
            code: (json as { code?: string }).code,
            error: json.error,
            fallback: t("ai.requestFailed"),
            rateLimitFallback: t("ai.rateLimited"),
            reportLimitFallback: t("shopReport.limitReached"),
          }),
        );
      }
      const codesRaw = json.data?.codes ?? json.codes ?? [];
      const codes = codesRaw.map((c) => lookupDtc(c.code));
      // Also scrape model notes for codes
      const extra = extractDtcCodes(
        [json.data?.notes, json.data?.raw_text_glimpse].filter(Boolean).join(" "),
      ).map(lookupDtc);
      const byCode = new Map<string, ReturnType<typeof lookupDtc>>();
      for (const c of [...codes, ...extra]) byCode.set(c.code, c);
      const merged = [...byCode.values()];

      setIsLoading(false);
      if (merged.length) {
        await handleSend(
          buildDtcDiagnosisPrompt({
            codes: merged,
            source: "obd_screenshot",
            vehicleLabel,
          }),
          [imageDataUrl],
        );
      } else {
        await handleSend(
          "I uploaded an OBD scanner / warning-light photo but no fault code was readable. Please analyze the image, ask one clarifying question if needed, and suggest safe DIY next steps (or how to re-capture the code screen).",
          [imageDataUrl],
        );
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : t("ai.requestFailed");
      setRequestError(message);
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `⚠️ ${message}`,
          timestamp: new Date(),
        },
      ]);
      setIsLoading(false);
    }
  };

  const handleRegenerate = async () => {
    const msgs = messagesRef.current;
    let cut = msgs.length;
    while (cut > 0 && msgs[cut - 1]?.role === "assistant") cut -= 1;
    const base = msgs.slice(0, cut);
    if (!base.length || base[base.length - 1]?.role !== "user") return;
    setMessages(base);
    const lastUser = base[base.length - 1];
    const photos = (lastUser.images ?? (lastUser.image ? [lastUser.image] : []))
      .filter(Boolean)
      .slice(0, 4);
    await runChatRequest(base, photos);
  };

  const handleEditUser = (content: string) => {
    setDraftValue(content);
  };

  const handleQuickPrompt = (prompt: string) => {
    void handleSend(prompt);
  };

  return (
    <div className="flex h-full min-h-0 flex-1 overflow-hidden">
      <div className="hidden w-72 shrink-0 border-r border-slate-800 bg-[#111827] lg:block">
        <VehicleManager
          vehicles={vehicles}
          currentVehicle={currentVehicle}
          onVehicleChange={(v) => void handleVehicleChange(v)}
          onAddVehicle={(v) => void handleAddVehicle(v)}
          canAdd={features.canAddVehicle(vehicles.length)}
          maxVehicles={features.maxVehicles}
          onUpdateVehicle={
            onUpdateVehicle
              ? (v) => void handleUpdateVehicle(v)
              : undefined
          }
          onArchiveVehicle={
            onArchiveVehicle
              ? (v) => void onArchiveVehicle(v)
              : undefined
          }
          onRemoveVehicle={
            onRemoveVehicle
              ? (v) => void onRemoveVehicle(v)
              : undefined
          }
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-2 border-b border-slate-800 bg-[#111827] px-3 py-2 lg:hidden">
          <button
            type="button"
            onClick={() => setShowVehicleSwitcher(true)}
            className="min-w-0 flex-1 text-left"
          >
            <VehiclePanel vehicle={currentVehicle} isMobile />
          </button>
          <div className="flex shrink-0 items-center gap-1.5">
            {currentVehicle && (
              <button
                type="button"
                data-testid="shop-report-open"
                onClick={() => setShopReportOpen(true)}
                className="inline-flex items-center gap-1 rounded-xl border border-slate-700 px-2 py-1.5 text-[11px] font-medium text-cyan-300 hover:bg-slate-800"
                title={t("shopReport.openCta")}
              >
                <FileText className="h-3.5 w-3.5" />
                Shop
              </button>
            )}
            {isFree && <UpgradeButton label="Pro" />}
          </div>
        </div>

        <div className="hidden items-center justify-between border-b border-slate-800 bg-[#111827] px-4 py-3 lg:flex">
          <div className="text-sm text-slate-400">
            {vehiclesLoading
              ? "Loading garage…"
              : currentVehicle
                ? formatVehicleYmmMarket(currentVehicle)
                : "No vehicle yet — add one from the sidebar"}
            {isFree && currentVehicle && (
              <span className="ml-2 text-xs text-slate-500">
                · Free keeps last {FREE_CHAT_MESSAGE_LIMIT} messages in cloud
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {currentVehicle && (
              <button
                type="button"
                data-testid="shop-report-open-desktop"
                onClick={() => setShopReportOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 px-3 py-1.5 text-xs font-semibold text-cyan-300 hover:bg-slate-800"
              >
                <FileText className="h-3.5 w-3.5" />
                {t("shopReport.openCta")}
              </button>
            )}
            {isFree && <UpgradeButton label="Upgrade to Pro" />}
          </div>
        </div>

        <MessageList
          messages={messages}
          isLoading={isLoading}
          vehicle={currentVehicle ?? undefined}
          onGoToInventory={onGoToInventory}
          onOpenFocus={onFocusDetected}
          onRegenerate={() => void handleRegenerate()}
          onEditUser={handleEditUser}
          onQuickPrompt={handleQuickPrompt}
          onGenerateShopReport={() => setShopReportOpen(true)}
        />
        {requestError && !isLoading ? (
          <div className="shrink-0 border-t border-amber-800/40 bg-amber-950/40 px-4 py-2.5">
            <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-amber-100">
                {t("ai.requestFailed")}: {requestError}
              </p>
              <button
                type="button"
                onClick={() => {
                  setRequestError(null);
                  void handleRegenerate();
                }}
                className="rounded-xl bg-cyan-500 px-3 py-1.5 text-sm font-semibold text-black hover:bg-cyan-400"
              >
                {t("ai.retry")}
              </button>
            </div>
          </div>
        ) : null}
        {(sessionSafety.tier !== "low" || sessionSafety.mods) &&
        messages.some((m) => m.role === "assistant") ? (
          <div className="shrink-0 border-t border-slate-800 px-3 py-2 sm:px-4">
            <p className="mb-1.5 text-[11px] text-slate-500">
              {INSURANCE_SAFETY_COPY.possibleFactorsOnly}{" "}
              {INSURANCE_SAFETY_COPY.nextStepOptions}
            </p>
            <SafetyTierTip
              tier={sessionSafety.tier}
              mods={sessionSafety.mods}
              onExportShopReport={() => setShopReportOpen(true)}
            />
          </div>
        ) : null}
        <ChatInput
          onSend={(c, imgs) => void handleSend(c, imgs)}
          onFaultCode={handleFaultCode}
          onObdScreenshot={(img) => void handleObdScreenshot(img)}
          onObdBleSession={handleObdBleSession}
          vehicleId={currentVehicle?.id}
          onMileageSynced={(result) => {
            if (!currentVehicle) return;
            onMergeVehicleLocal?.(currentVehicle.id, {
              mileage: result.mileage,
              mileageUnit: result.unit,
            });
          }}
          onScanReceipt={() => setReceiptModalOpen(true)}
          isLoading={vehiclesLoading || !ready || !currentVehicle}
          isGenerating={isLoading}
          autoSpeak={autoSpeak}
          onAutoSpeakChange={setAutoSpeak}
          onStop={handleStop}
          draftValue={draftValue}
          onDraftConsumed={() => setDraftValue(undefined)}
        />
      </div>

      <ReceiptConfirmModal
        open={receiptModalOpen}
        onClose={() => setReceiptModalOpen(false)}
        vehicles={vehicles}
        defaultVehicleId={currentVehicle?.id}
        mode="scan"
        onSaved={handleReceiptSaved}
      />

      {currentVehicle && (
        <ShopReportModal
          open={shopReportOpen}
          onClose={() => setShopReportOpen(false)}
          source="chat"
          vehicle={currentVehicle}
          messages={messages
            .filter((m) => m.id !== "welcome")
            .map((m) => ({
              role: m.role,
              content: m.content,
              image: m.image,
              images: m.images,
            }))}
        />
      )}

      <MobileVehicleSwitcher
        open={showVehicleSwitcher}
        onClose={() => setShowVehicleSwitcher(false)}
        vehicles={vehicles}
        currentVehicle={currentVehicle}
        onVehicleChange={(v) => void handleVehicleChange(v)}
        onAddVehicle={(v) => void handleAddVehicle(v)}
        canAdd={features.canAddVehicle(vehicles.length)}
        maxVehicles={features.maxVehicles}
        onUpdateVehicle={
          onUpdateVehicle
            ? (v) => void handleUpdateVehicle(v)
            : undefined
        }
      />
    </div>
  );
}
