"use client";

import { useState, useEffect, useRef } from "react";
import { ChatMessage, VehicleInfo } from "@/lib/types/chat";
import { createWelcomeMessage } from "@/lib/constants";
import { saveCurrentVehicleId } from "@/lib/chat-storage";
import { chatCloudService } from "@/lib/chat-cloud";
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
import { extractFocusCommand, resolveFocusCommand } from "@/lib/parse-ai-focus";
import type { FocusCommand } from "@/lib/types/focus";
import type { RagKnowledgeHit } from "@/lib/types/rag";
import { maintenanceService } from "@/lib/maintenance-records";
import {
  formatMaintenanceHistoryForPrompt,
  trimMessagesForApi,
} from "@/lib/chat-repair-loop";
import {
  buildDtcDiagnosisPrompt,
  buildObdBleDiagnosisPrompt,
  extractDtcCodes,
  lookupDtc,
  lookupDtcsFromText,
} from "@/lib/dtc";
import type { ObdVisionAnalysis } from "@/lib/types/dtc";
import type { ObdSessionSnapshot } from "@/lib/types/obd-session";

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
  onArchiveVehicle,
  onRemoveVehicle,
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showVehicleSwitcher, setShowVehicleSwitcher] = useState(false);
  const [ready, setReady] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [draftValue, setDraftValue] = useState<string | undefined>();
  const [maintenanceSummary, setMaintenanceSummary] = useState<string>("");
  const seedSentRef = useRef<string | null>(null);
  const lastSpokenIdRef = useRef<string | null>(null);
  const shouldSpeakNextAssistantRef = useRef(false);
  const skipNextPersistRef = useRef(false);
  const loadGenRef = useRef(0);
  const loadedKeyRef = useRef<string | null>(null);
  const playbookSlugRef = useRef<string | null>(playbookSlug ?? null);
  const abortRef = useRef<AbortController | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const { refresh: refreshTokenUsage } = useTokenUsage();
  const { isFree, isPro, features } = useSubscription();

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
      try {
        const cloud = await chatCloudService.load(vehicleId, { isPro });
        if (cancelled || loadGenRef.current !== gen) return;
        setMessages(cloud ?? [createWelcomeMessage()]);
      } catch (err) {
        console.warn("[ChatApp] cloud load failed, welcome only:", err);
        if (cancelled || loadGenRef.current !== gen) return;
        setMessages([createWelcomeMessage()]);
      } finally {
        if (!cancelled && loadGenRef.current === gen) {
          loadedKeyRef.current = loadKey;
          setAutoSpeak(loadAutoSpeakPreference(true));
          setReady(true);
        }
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
        setMaintenanceSummary(
          formatMaintenanceHistoryForPrompt(records, { truncated, total }),
        );
      } catch (err) {
        console.warn("[ChatApp] maintenance context:", err);
        if (!cancelled) setMaintenanceSummary("");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentVehicle?.id, isPro, vehiclesLoading]);

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
      alert(
        `Your plan allows up to ${features.maxVehicles} vehicle${
          features.maxVehicles === 1 ? "" : "s"
        }. Upgrade for more.`,
      );
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

    shouldSpeakNextAssistantRef.current = Boolean(
      autoSpeak && features.voiceEnabled,
    );
    setIsLoading(true);

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
        throw new Error("Please sign in to use AI chat.");
      }

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          messages: trimMessagesForApi(nextMessages),
          images: imagePayloads,
          image: imagePayloads[0],
          currentVehicle,
          playbookSlug: playbookSlugRef.current || undefined,
          maintenanceSummary: maintenanceSummary || undefined,
        }),
      });

      const data = (await response.json()) as {
        content?: string;
        error?: string;
        suggestedFocus?: FocusCommand | null;
        ragHits?: RagKnowledgeHit[];
      };

      if (!response.ok) {
        throw new Error(data.error || "Chat request failed");
      }

      const assistantContent = data.content || "I could not generate a reply.";
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: assistantContent,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
      void refreshTokenUsage();

      const focus =
        data.suggestedFocus ||
        resolveFocusCommand(assistantContent, data.ragHits) ||
        extractFocusCommand(assistantContent);
      if (focus && onFocusDetected) {
        onFocusDetected(focus);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: "_Generation stopped._ You can continue or regenerate.",
            timestamp: new Date(),
          },
        ]);
        return;
      }
      const message =
        err instanceof Error ? err.message : "Something went wrong.";
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
      alert("Sign in to analyze an OBD screenshot.");
      return;
    }

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
      const json = (await res.json()) as {
        success?: boolean;
        data?: ObdVisionAnalysis;
        codes?: ObdVisionAnalysis["codes"];
        error?: string;
      };
      if (!res.ok) {
        alert(json.error || "Could not read the OBD screenshot.");
        return;
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
      console.error("[ChatApp] OBD screenshot", err);
      alert("Could not analyze the OBD screenshot. Try again.");
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
          {isFree && <UpgradeButton label="Pro" />}
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
          {isFree && <UpgradeButton label="Upgrade to Pro" />}
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
        />
        <ChatInput
          onSend={(c, imgs) => void handleSend(c, imgs)}
          onFaultCode={handleFaultCode}
          onObdScreenshot={(img) => void handleObdScreenshot(img)}
          onObdBleSession={handleObdBleSession}
          isLoading={vehiclesLoading || !ready || !currentVehicle}
          isGenerating={isLoading}
          autoSpeak={autoSpeak}
          onAutoSpeakChange={setAutoSpeak}
          onStop={handleStop}
          draftValue={draftValue}
          onDraftConsumed={() => setDraftValue(undefined)}
        />
      </div>

      <MobileVehicleSwitcher
        open={showVehicleSwitcher}
        onClose={() => setShowVehicleSwitcher(false)}
        vehicles={vehicles}
        currentVehicle={currentVehicle}
        onVehicleChange={(v) => void handleVehicleChange(v)}
        onAddVehicle={(v) => void handleAddVehicle(v)}
        onUpdateVehicle={
          onUpdateVehicle
            ? (v) => void handleUpdateVehicle(v)
            : undefined
        }
      />
    </div>
  );
}
