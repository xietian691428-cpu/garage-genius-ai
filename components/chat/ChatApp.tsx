"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { ChatMessage, VehicleInfo } from "@/lib/types/chat";
import { isPhotoPromptWithoutImages } from "@/lib/chat-empty-photo";
import {
  CHAT_VISION_MAX_IMAGES,
  type ImageAnalysisClientSummary,
} from "@/lib/vision/types";
import { createWelcomeMessage } from "@/lib/constants";
import { loadChatMessages, saveCurrentVehicleId } from "@/lib/chat-storage";
import { chatCloudService, resolveLoadedChat } from "@/lib/chat-cloud";
import { formatVehicleYmmDisplay } from "@/lib/types/vehicle-market";
import VehicleManager from "../vehicles/VehicleManager";
import MobileVehicleSwitcher from "../vehicles/MobileVehicleSwitcher";
import VehiclePanel from "./VehiclePanel";
import MessageList from "./MessageList";
import ChatInput from "./ChatInput";
import DtcCodeModal from "./DtcCodeModal";
import ChatSafetyNotesSheet from "./ChatSafetyNotesSheet";
import { useChatDisclaimer } from "@/hooks/useChatDisclaimer";
import { ensureSafetyTopicsRemote } from "@/lib/safety-topics-remote";
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
import type { FocusCommand } from "@/lib/types/focus";
import type { RagKnowledgeHit } from "@/lib/types/rag";
import { maintenanceService } from "@/lib/maintenance-records";
import { useTranslation } from "react-i18next";
import { hideStorePurchaseUi } from "@/lib/native-platform";
import { formatMaintenanceHistoryForPrompt } from "@/lib/chat-repair-loop";
import {
  detectIntentDrift,
  logChatDrift,
  matchDriftSafetyTopics,
  type DriftCheckResult,
  type TurnFocus,
} from "@/lib/chat-intent-drift";
import {
  clearChatFocus,
  driftHistoryOptions,
  loadChatFocus,
  nextChatFocusStore,
  previousFocusFromStore,
  saveChatFocus,
} from "@/lib/chat-focus-storage";
import {
  computeVehicleFamiliarity,
  formatFamiliarityForPrompt,
} from "@/lib/vehicle-familiarity";
import ReceiptConfirmModal from "@/components/history/ReceiptConfirmModal";
import {
  combineSafetyTiers,
  inferSafetyTierFromText,
  safetyTierForPlaybook,
} from "@/lib/safety-tier";
import { vehicleHasModifiedTag } from "@/lib/insurance-tips";
import { MOD_CONTEXT_PATTERN } from "@/lib/insurance-safety-copy";
import ShopReportModal from "@/components/shop-report/ShopReportModal";
import { formatAiHttpError } from "@/lib/format-ai-http-error";
import {
  detectVehicleVpicYmmConflict,
  hasYmmUnverifiedTag,
} from "@/lib/vehicle-data/ymm-conflict";
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
import {
  formatVehicleShort,
} from "@/lib/garage-vehicle-match";
import {
  resolveChatVehicleGate,
} from "@/lib/chat-vehicle-gate";
import {
  classifyChatFetchError,
  formatChatClientError,
  type ChatClientError,
} from "@/lib/chat-request-error";
import {
  gateCopy,
  resolveGateLanguage,
} from "@/lib/gate-copy";
import type { ReplyLanguageHint } from "@/lib/reply-language";
import AddVehicleModal from "@/components/vehicles/AddVehicleModal";
import VehicleManualPanel from "@/components/vehicles/VehicleManualPanel";
import UpgradeModal, {
  type UpgradeReason,
} from "@/components/ui/UpgradeModal";
import { FileText, MessageSquarePlus, ListTree, X } from "lucide-react";
import { useBodyScrollLock } from "@/lib/hooks/useBodyScrollLock";
import {
  dismissManualNudge,
  dismissManualNudgeNoCopy,
  noteNoAnchorSpecReply,
  shouldShowManualNudge,
} from "@/lib/vehicle-manual-nudge";
import { isManualSpecQuestion } from "@/lib/vehicle-manuals";
import {
  createVehicleThread,
  fetchThreadMessages,
  fetchVehicleThreads,
  type ChatThreadSummary,
} from "@/lib/chat-threads-client";
import {
  isContextSwitchAbort,
  shouldCommitChatResponse,
  type ChatRequestAbortReason,
} from "@/lib/chat-request-commit";
import { useAiConsentGate } from "@/components/legal/AiConsentProvider";
import {
  getUsHighFreqDtcChips,
  POST_SAVE_NUDGE_COPY,
  EMPTY_GARAGE_DIY_HEADLINE,
  EMPTY_GARAGE_DIY_STEPS,
} from "@/lib/us-completion-funnel";

/** Shared touch-friendly CTA for gate / switch banners (≥44px). */
const GATE_CTA =
  "inline-flex min-h-[44px] touch-manipulation items-center justify-center rounded-xl px-3 py-2.5 text-sm font-semibold";
const GATE_CTA_PRIMARY = `${GATE_CTA} bg-cyan-500 text-black hover:bg-cyan-400`;
const GATE_CTA_SECONDARY = `${GATE_CTA} border border-slate-600 text-slate-200 hover:bg-slate-800`;
const GATE_CTA_GHOST = `${GATE_CTA} border border-slate-700 font-medium text-slate-400 hover:bg-slate-800`;

interface Props {
  seedPrompt?: string;
  /** Optional photos to attach with seedPrompt (Dashboard camera → Chat) */
  seedImages?: string[];
  /** Coach playbook slug for token analytics attribution */
  playbookSlug?: string | null;
  onPromptUsed?: () => void;
  onGoToInventory?: () => void;
  onFocusDetected?: (command: FocusCommand) => void;
  onOpenPlaybook?: (slug: string) => void;
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
  onOpenPlaybook,
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
  const { t, i18n } = useTranslation();
  const { ensureConsent } = useAiConsentGate();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hiddenEmptyPhotoIds, setHiddenEmptyPhotoIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showVehicleSwitcher, setShowVehicleSwitcher] = useState(false);
  const [ready, setReady] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [draftValue, setDraftValue] = useState<string | undefined>();
  const [maintenanceSummary, setMaintenanceSummary] = useState<string>("");
  const [receiptModalOpen, setReceiptModalOpen] = useState(false);
  const [shopReportOpen, setShopReportOpen] = useState(false);
  const [maintenanceTick, setMaintenanceTick] = useState(0);
  const [requestError, setRequestError] = useState<ChatClientError | null>(
    null,
  );
  const [pendingGarageSwitch, setPendingGarageSwitch] = useState<{
    content: string;
    images: string[];
    vehicle: VehicleInfo;
    mentionLabel: string;
    lang: ReplyLanguageHint;
  } | null>(null);
  const [gateBanner, setGateBanner] = useState<{
    code: Exclude<
      import("@/lib/chat-vehicle-gate").ChatGateCode,
      "ok" | "switch_confirm"
    >;
    message: string;
    lang: ReplyLanguageHint;
    mentionLabel?: string;
    candidates?: VehicleInfo[];
    makeHint?: string;
    modelHint?: string;
    pendingContent?: string;
    pendingImages?: string[];
  } | null>(null);
  const [addVehicleOpen, setAddVehicleOpen] = useState(false);
  const [postSaveNudge, setPostSaveNudge] = useState(false);
  /** Soft toast after garage vehicle switch — history is per vehicle_id. */
  const [vehicleIsolatedToast, setVehicleIsolatedToast] = useState(false);
  /** Soft toast after New topic on the same vehicle. */
  const [newTopicToast, setNewTopicToast] = useState(false);
  const [threadSheetOpen, setThreadSheetOpen] = useState(false);
  const [threadList, setThreadList] = useState<ChatThreadSummary[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [topicHintDismissed, setTopicHintDismissed] = useState(false);
  const [manualNudgeOpen, setManualNudgeOpen] = useState(false);
  const [manualNudgeNoCopyOpen, setManualNudgeNoCopyOpen] = useState(false);
  const [hasSearchableManual, setHasSearchableManual] = useState(false);
  const [pendingOilExtracts, setPendingOilExtracts] = useState(0);
  const [pendingCoolantExtracts, setPendingCoolantExtracts] = useState(0);
  const [pendingBrakeExtracts, setPendingBrakeExtracts] = useState(0);
  const [extractBadgeDismissed, setExtractBadgeDismissed] = useState(false);
  const [manualUploadOpen, setManualUploadOpen] = useState(false);
  useBodyScrollLock(threadSheetOpen || manualUploadOpen);
  const [postSaveDtcOpen, setPostSaveDtcOpen] = useState(false);
  const [addVehicleSeed, setAddVehicleSeed] = useState<{
    make?: string;
    model?: string;
    label?: string;
  } | null>(null);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [upgradeReason, setUpgradeReason] =
    useState<UpgradeReason>("vehicles");
  const seedSentRef = useRef<string | null>(null);
  const lastSpokenIdRef = useRef<string | null>(null);
  const shouldSpeakNextAssistantRef = useRef(false);
  const skipNextPersistRef = useRef(false);
  const loadGenRef = useRef(0);
  const loadedKeyRef = useRef<string | null>(null);
  const playbookSlugRef = useRef<string | null>(playbookSlug ?? null);
  const abortRef = useRef<AbortController | null>(null);
  const stoppedByUserRef = useRef(false);
  const abortReasonRef = useRef<ChatRequestAbortReason>("none");
  const readAbortReason = (): ChatRequestAbortReason => abortReasonRef.current;
  /**
   * Bumped on 切车 / New topic / Topics switch so a late 200 from the old
   * request cannot append into the new vehicle/thread UI.
   */
  const chatRequestEpochRef = useRef(0);
  const currentVehicleIdRef = useRef<string | null>(null);
  const activeThreadIdRef = useRef<string | null>(null);
  const inFlightVehicleIdRef = useRef<string | null>(null);
  const inFlightThreadIdRef = useRef<string | null>(null);
  /** After vehicle switch/add, send only once the new vehicle's history is loaded. */
  const pendingSendAfterLoadRef = useRef<{
    vehicleId: string;
    content: string;
    images: string[];
  } | null>(null);
  /**
   * First API turn after selectedVehicleId changes must not include pre-switch
   * user/assistant history (server also enforces via vehicleThreadReset).
   */
  const pendingVehicleThreadResetRef = useRef(false);
  /** Last vehicle id that successfully opened a Chat API turn. */
  const lastApiVehicleIdRef = useRef<string | null>(null);
  /** Server chat_threads id per vehicle — cleared on switch / force-new. */
  const threadIdByVehicleRef = useRef<Record<string, string>>({});
  const messagesRef = useRef<ChatMessage[]>([]);
  const pendingPersistRef = useRef<{
    vehicleId: string;
    messages: ChatMessage[];
    isPro: boolean;
  } | null>(null);
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

  const assistantCount = useMemo(
    () =>
      messages.filter((m) => m.role === "assistant" && m.id !== "welcome")
        .length,
    [messages],
  );
  const chatDisclaimer = useChatDisclaimer(assistantCount);

  useEffect(() => {
    void ensureSafetyTopicsRemote();
  }, []);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    currentVehicleIdRef.current = currentVehicle?.id ?? null;
  }, [currentVehicle?.id]);

  useEffect(() => {
    activeThreadIdRef.current = activeThreadId;
  }, [activeThreadId]);

  // Private manual status for nudge (this vehicle only).
  useEffect(() => {
    if (!currentVehicle?.id) {
      setHasSearchableManual(false);
      setPendingOilExtracts(0);
      setPendingCoolantExtracts(0);
      setPendingBrakeExtracts(0);
      setExtractBadgeDismissed(false);
      setManualNudgeOpen(false);
      setManualNudgeNoCopyOpen(false);
      return;
    }
    setManualNudgeNoCopyOpen(false);
    setExtractBadgeDismissed(false);
    let cancelled = false;
    void (async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) return;
        const res = await fetch(
          `/api/vehicles/${currentVehicle.id}/manual`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as {
          manual?: { searchable?: boolean } | null;
          extracts?: Array<{ kind?: string; field?: string }>;
        };
        if (!cancelled) {
          setHasSearchableManual(Boolean(data.manual?.searchable));
          const rows = Array.isArray(data.extracts) ? data.extracts : [];
          const oil = rows.filter(
            (ex) =>
              (ex.kind || "oil") === "oil" ||
              ex.field === "viscosity" ||
              ex.field === "capacity",
          ).length;
          const coolant = rows.filter(
            (ex) =>
              ex.kind === "coolant" ||
              String(ex.field || "").startsWith("coolant_"),
          ).length;
          const brake = rows.filter(
            (ex) =>
              ex.kind === "brake_fluid" ||
              String(ex.field || "").startsWith("brake_fluid_"),
          ).length;
          setPendingOilExtracts(oil);
          setPendingCoolantExtracts(coolant);
          setPendingBrakeExtracts(brake);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentVehicle?.id]);

  useEffect(() => {
    if (!vehicleIsolatedToast) return;
    const timer = window.setTimeout(() => setVehicleIsolatedToast(false), 8_000);
    return () => window.clearTimeout(timer);
  }, [vehicleIsolatedToast]);

  useEffect(() => {
    if (!newTopicToast) return;
    const timer = window.setTimeout(() => setNewTopicToast(false), 8_000);
    return () => window.clearTimeout(timer);
  }, [newTopicToast]);

  useEffect(() => {
    playbookSlugRef.current = playbookSlug ?? null;
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

  // Load default/latest thread for this vehicle (server-authoritative).
  useEffect(() => {
    if (vehiclesLoading) return;
    if (!currentVehicle) {
      setMessages([createWelcomeMessage()]);
      setActiveThreadId(null);
      setThreadList([]);
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
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) {
          const resolved = resolveLoadedChat({
            cloud: null,
            local: loadChatMessages(vehicleId),
            cloudFailed: true,
            welcome: createWelcomeMessage(),
          });
          if (cancelled || loadGenRef.current !== gen) return;
          setMessages(resolved.messages);
          setActiveThreadId(null);
          return;
        }
        const threads = await fetchVehicleThreads(token, vehicleId);
        if (cancelled || loadGenRef.current !== gen) return;
        setThreadList(threads);
        const latest = threads[0];
        if (latest) {
          const packed = await fetchThreadMessages(token, latest.id);
          if (cancelled || loadGenRef.current !== gen) return;
          threadIdByVehicleRef.current[vehicleId] = packed.threadId;
          setActiveThreadId(packed.threadId);
          setMessages(
            packed.messages.length
              ? packed.messages
              : [createWelcomeMessage()],
          );
          skipNextPersistRef.current = true;
        } else {
          delete threadIdByVehicleRef.current[vehicleId];
          setActiveThreadId(null);
          setMessages([createWelcomeMessage()]);
        }
      } catch (err) {
        console.warn("[ChatApp] thread load failed, using local cache:", err);
        if (cancelled || loadGenRef.current !== gen) return;
        const resolved = resolveLoadedChat({
          cloud: null,
          local: loadChatMessages(vehicleId),
          cloudFailed: true,
          welcome: createWelcomeMessage(),
        });
        setMessages(resolved.messages);
        setActiveThreadId(threadIdByVehicleRef.current[vehicleId] ?? null);
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

  // Flush queued question only after the *target* vehicle's history is ready
  useEffect(() => {
    if (!ready || !currentVehicle || isLoading) return;
    const pending = pendingSendAfterLoadRef.current;
    if (!pending || pending.vehicleId !== currentVehicle.id) return;
    pendingSendAfterLoadRef.current = null;
    const { content, images } = pending;
    void (async () => {
      const photoList = images.filter(Boolean).slice(0, CHAT_VISION_MAX_IMAGES);
      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content,
        image: photoList[0],
        images: photoList.length ? photoList : undefined,
        timestamp: new Date(),
      };
      const nextMessages = [...messagesRef.current, userMessage];
      setMessages(nextMessages);
      await runChatRequest(nextMessages, photoList);
    })();
  }, [ready, currentVehicle?.id, isLoading]);

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

  // Empty garage / no selection — persistent guide (shared current-vehicle state)
  useEffect(() => {
    if (vehiclesLoading) return;
    const lang = resolveGateLanguage("", i18n.language);
    if (!vehicles.length) {
      setGateBanner({
        code: "empty_garage",
        message: gateCopy(lang, "gateEmptyGarage"),
        lang,
      });
      return;
    }
    if (!currentVehicle) {
      setGateBanner({
        code: "no_vehicle_selected",
        message: gateCopy(lang, "gateNoVehicle"),
        lang,
      });
      return;
    }
    setGateBanner((prev) =>
      prev?.code === "empty_garage" || prev?.code === "no_vehicle_selected"
        ? null
        : prev,
    );
  }, [vehiclesLoading, vehicles.length, currentVehicle, i18n.language]);

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
    pendingPersistRef.current = { vehicleId, messages: snapshot, isPro };
    const timer = window.setTimeout(() => {
      pendingPersistRef.current = null;
      void chatCloudService
        .save(vehicleId, snapshot, { isPro })
        .catch((err) => console.warn("[ChatApp] cloud save:", err));
    }, 450);

    return () => window.clearTimeout(timer);
  }, [messages, currentVehicle, ready, isPro]);

  // Tab switches unmount Chat; flush a debounced save that hasn't fired yet.
  useEffect(() => {
    return () => {
      const pending = pendingPersistRef.current;
      if (!pending) return;
      pendingPersistRef.current = null;
      void chatCloudService
        .save(pending.vehicleId, pending.messages, { isPro: pending.isPro })
        .catch((err) => console.warn("[ChatApp] unmount save:", err));
    };
  }, []);

  useEffect(() => {
    if (!seedPrompt?.trim()) {
      seedSentRef.current = null;
      return;
    }
    if (isPhotoPromptWithoutImages(seedPrompt, seedImages)) {
      seedSentRef.current = `${seedPrompt}::0`;
      onPromptUsed?.();
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

  /**
   * Abort in-flight /api/chat when the target vehicle or thread changes.
   * Hand-test: send a long prompt → immediately New topic or 切车 → old
   * assistant must not appear on the new session (epoch + AbortController).
   */
  const abortInFlightForContextSwitch = () => {
    chatRequestEpochRef.current += 1;
    abortReasonRef.current = "context_switch";
    abortRef.current?.abort();
    abortRef.current = null;
    stoppedByUserRef.current = false;
    inFlightVehicleIdRef.current = null;
    inFlightThreadIdRef.current = null;
    setIsLoading(false);
    stopSpeaking();
  };

  const handleVehicleChange = async (vehicle: VehicleInfo) => {
    abortInFlightForContextSwitch();
    if (
      pendingSendAfterLoadRef.current &&
      pendingSendAfterLoadRef.current.vehicleId !== vehicle.id
    ) {
      pendingSendAfterLoadRef.current = null;
    }
    if (currentVehicle) {
      await persistNow(currentVehicle.id, messages);
    }
    // Do not keep the previous vehicle's transcript/focus on screen while the
    // next garage row loads — prevents Regenerate / chips from mixing cars.
    setReady(false);
    loadedKeyRef.current = null;
    setMessages([createWelcomeMessage()]);
    setMaintenanceSummary("");
    pendingVehicleThreadResetRef.current = true;
    delete threadIdByVehicleRef.current[vehicle.id];
    setActiveThreadId(null);
    setThreadList([]);
    setTopicHintDismissed(false);
    setVehicleIsolatedToast(true);
    clearChatFocus(vehicle.id, null);
    await onVehicleChange(vehicle);
    saveCurrentVehicleId(vehicle.id);
    // load effect will run for new vehicle id
  };

  const handleNewTopic = async () => {
    if (!currentVehicle) return;
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      alert(t("ai.signInRequired"));
      return;
    }
    try {
      abortInFlightForContextSwitch();
      const { threadId } = await createVehicleThread(
        token,
        currentVehicle.id,
      );
      threadIdByVehicleRef.current[currentVehicle.id] = threadId;
      setActiveThreadId(threadId);
      clearChatFocus(currentVehicle.id, threadId);
      setMessages([createWelcomeMessage()]);
      skipNextPersistRef.current = true;
      setTopicHintDismissed(false);
      setNewTopicToast(true);
      setThreadSheetOpen(false);
      // Refresh list in background
      void fetchVehicleThreads(token, currentVehicle.id)
        .then(setThreadList)
        .catch(() => {});
    } catch (err) {
      console.error("[ChatApp] new topic failed:", err);
      alert(
        err instanceof Error ? err.message : t("ai.requestFailed"),
      );
    }
  };

  const handleSelectThread = async (threadId: string) => {
    if (!currentVehicle) return;
    if (threadId === activeThreadId) {
      setThreadSheetOpen(false);
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
    try {
      abortInFlightForContextSwitch();
      const packed = await fetchThreadMessages(token, threadId);
      if (packed.vehicleId !== currentVehicle.id) {
        throw new Error(t("ai.vehicleSelectionMismatch"));
      }
      threadIdByVehicleRef.current[currentVehicle.id] = packed.threadId;
      setActiveThreadId(packed.threadId);
      setMessages(
        packed.messages.length ? packed.messages : [createWelcomeMessage()],
      );
      skipNextPersistRef.current = true;
      setThreadSheetOpen(false);
    } catch (err) {
      console.error("[ChatApp] select topic failed:", err);
      alert(
        err instanceof Error ? err.message : t("ai.requestFailed"),
      );
    }
  };

  const openThreadSheet = async () => {
    if (!currentVehicle) return;
    setThreadSheetOpen(true);
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return;
    try {
      const threads = await fetchVehicleThreads(token, currentVehicle.id);
      setThreadList(threads);
    } catch (err) {
      console.warn("[ChatApp] list topics:", err);
    }
  };

  const handleAddVehicle = async (newVehicle: VehicleInfo) => {
    if (!features.canAddVehicle(vehicles.length)) {
      alert(
        t(
          hideStorePurchaseUi()
            ? "vehicles.planLimitStore"
            : "vehicles.planLimit",
          { count: features.maxVehicles },
        ),
      );
      return;
    }

    abortInFlightForContextSwitch();
    if (currentVehicle) {
      await persistNow(currentVehicle.id, messages);
    }
    setReady(false);
    loadedKeyRef.current = null;
    setMessages([createWelcomeMessage()]);
    setMaintenanceSummary("");
    pendingVehicleThreadResetRef.current = true;
    delete threadIdByVehicleRef.current[newVehicle.id];
    setVehicleIsolatedToast(true);
    try {
      await onAddVehicle(newVehicle);
      setPostSaveNudge(true);
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
    abortReasonRef.current = "user";
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
    const activeVehicle = currentVehicle;

    if (!activeVehicle) {
      alert("Add a vehicle to your garage before chatting.");
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    stoppedByUserRef.current = false;
    abortReasonRef.current = "none";
    const requestEpoch = chatRequestEpochRef.current;
    const boundThreadIdAtStart =
      threadIdByVehicleRef.current[activeVehicle.id] ?? activeThreadId;
    inFlightVehicleIdRef.current = activeVehicle.id;
    inFlightThreadIdRef.current = boundThreadIdAtStart;

    shouldSpeakNextAssistantRef.current = Boolean(
      autoSpeak && features.voiceEnabled,
    );
    setIsLoading(true);
    setRequestError(null);

    const CLIENT_TIMEOUT_MS = 90_000;
    const timeoutId = window.setTimeout(() => {
      if (abortRef.current === controller && !stoppedByUserRef.current) {
        abortReasonRef.current = "timeout";
        controller.abort();
      }
    }, CLIENT_TIMEOUT_MS);

    const stillCurrentRequest = () =>
      shouldCommitChatResponse({
        requestEpoch,
        currentEpoch: chatRequestEpochRef.current,
        abortReason: readAbortReason(),
        requestVehicleId: activeVehicle.id,
        activeVehicleId: currentVehicleIdRef.current,
        // Capture at send start — do not read mutable inFlightThreadIdRef
        // (context switch nulls it; late 200 must still fail via epoch).
        requestThreadId: boundThreadIdAtStart,
        activeThreadId: activeThreadIdRef.current,
      });

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

      const boundThreadId =
        threadIdByVehicleRef.current[activeVehicle.id] ?? activeThreadId;
      const focusStore = loadChatFocus(activeVehicle.id, boundThreadId);
      const lastUser = [...nextMessages]
        .reverse()
        .find((m) => m.role === "user");
      const userText = lastUser?.content?.trim() || "";
      const vehicleThreadReset =
        pendingVehicleThreadResetRef.current ||
        (lastApiVehicleIdRef.current != null &&
          lastApiVehicleIdRef.current !== activeVehicle.id);
      if (vehicleThreadReset) {
        pendingVehicleThreadResetRef.current = false;
        delete threadIdByVehicleRef.current[activeVehicle.id];
        setActiveThreadId(null);
        // Drop prior-car focus — New topic / other threads stay in their own keys.
        clearChatFocus(activeVehicle.id, boundThreadId);
      }
      const focusForTurn = vehicleThreadReset
        ? {
            vehicleId: activeVehicle.id,
            threadId: null as string | null,
            recent: [] as ReturnType<typeof loadChatFocus>["recent"],
            apiHistoryFromId: null,
            abandonedFocus: null,
          }
        : focusStore;
      const intentDrift = detectIntentDrift(
        userText,
        vehicleThreadReset
          ? lastUser
            ? [lastUser]
            : []
          : nextMessages,
        previousFocusFromStore(focusForTurn),
        matchDriftSafetyTopics(userText),
      );
      const historyOpts = vehicleThreadReset
        ? { latestUserOnly: true as const }
        : driftHistoryOptions(intentDrift, focusForTurn);
      logChatDrift(
        {
          shouldReset: intentDrift.shouldReset,
          reason: intentDrift.reason,
          summary: intentDrift.currentFocus.summary,
          vehicleRaised: intentDrift.currentFocus.vehicleRaised ?? false,
          parkingBrakeState:
            intentDrift.currentFocus.parkingBrakeState ?? "unknown",
          latestUserOnly: historyOpts.latestUserOnly,
          fromMessageId: historyOpts.fromMessageId,
          apiHistoryFromId: focusForTurn.apiHistoryFromId,
          vehicleThreadReset,
        },
        activeVehicle.id,
      );

      const previousVehicleId = lastApiVehicleIdRef.current;
      lastApiVehicleIdRef.current = activeVehicle.id;
      if (vehicleThreadReset) setVehicleIsolatedToast(false);

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          // Server-authoritative history: this turn only — never full transcript.
          message: userText,
          clientMessageId: lastUser?.id,
          threadId: vehicleThreadReset
            ? undefined
            : threadIdByVehicleRef.current[activeVehicle.id],
          images: imagePayloads,
          image: imagePayloads[0],
          currentVehicle: activeVehicle,
          selectedVehicleId: activeVehicle.id,
          vehicleThreadReset: vehicleThreadReset || undefined,
          vehicleChanged: vehicleThreadReset || undefined,
          previousVehicleId: previousVehicleId || undefined,
          playbookSlug: playbookSlugRef.current || undefined,
          maintenanceSummary: vehicleThreadReset
            ? undefined
            : maintenanceSummary || undefined,
          conversationFocus: {
            previous: vehicleThreadReset
              ? null
              : previousFocusFromStore(focusForTurn),
            abandoned: vehicleThreadReset
              ? null
              : focusForTurn.abandonedFocus,
            vehicleId: activeVehicle.id,
            threadId: vehicleThreadReset
              ? null
              : threadIdByVehicleRef.current[activeVehicle.id] ?? null,
            apiHistoryFromId: vehicleThreadReset
              ? null
              : focusForTurn.apiHistoryFromId,
          },
        }),
      });

      let data: {
        content?: string;
        threadId?: string | null;
        error?: string;
        code?: string;
        retryable?: boolean;
        suggestedFocus?: FocusCommand | null;
        ragHits?: RagKnowledgeHit[];
        drift?: {
          shouldReset: boolean;
          reason: DriftCheckResult["reason"];
          summary: string;
        };
        conversationFocus?: TurnFocus;
        imageAnalysis?: ImageAnalysisClientSummary | null;
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
            reportLimitFallback: t(
              hideStorePurchaseUi()
                ? "shopReport.limitReachedStore"
                : "shopReport.limitReached",
            ),
          }),
        );
      }

      if (!data.content?.trim()) {
        throw new Error(t("ai.emptyReply"));
      }

      // Late 200 after 切车 / New topic / Topics: drop — do not touch new UI.
      if (!stillCurrentRequest()) {
        return;
      }

      if (data.threadId) {
        threadIdByVehicleRef.current[activeVehicle.id] = data.threadId;
        setActiveThreadId(data.threadId);
        inFlightThreadIdRef.current = data.threadId;
      }

      const assistantContent = data.content.trim();
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: assistantContent,
        timestamp: new Date(),
        imageAnalysis: data.imageAnalysis ?? null,
      };

      setMessages((prev) => [...prev, assistantMessage]);
      setRequestError(null);
      void refreshTokenUsage();

      if (
        lastUser &&
        isManualSpecQuestion(lastUser.content || "") &&
        !hasSearchableManual &&
        shouldShowManualNudge({
          vehicleId: activeVehicle.id,
          hasSearchableManual: false,
          isSpecQuestion: true,
          highRiskStop: Boolean(
            data.content &&
              /STOP_RULE|do not drive|get clear from under/i.test(data.content),
          ),
          quotaBlocked: false,
        })
      ) {
        noteNoAnchorSpecReply(activeVehicle.id);
        setManualNudgeOpen(true);
      }

      if (lastUser && (data.conversationFocus || intentDrift.currentFocus)) {
        const resolved: DriftCheckResult = {
          ...intentDrift,
          shouldReset: data.drift?.shouldReset ?? intentDrift.shouldReset,
          reason: data.drift?.reason ?? intentDrift.reason,
          currentFocus: data.conversationFocus ?? intentDrift.currentFocus,
        };
        const tid =
          data.threadId ||
          threadIdByVehicleRef.current[activeVehicle.id] ||
          null;
        saveChatFocus(
          activeVehicle.id,
          nextChatFocusStore({
            vehicleId: activeVehicle.id,
            threadId: tid,
            store: focusForTurn,
            drift: resolved,
            latestUserId: lastUser.id,
            vehicleThreadReset,
          }),
          tid,
        );
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        // Context switch (vehicle / New topic / Topics): never write stop/timeout
        // bubbles into the new session.
        if (isContextSwitchAbort(readAbortReason()) || !stillCurrentRequest()) {
          return;
        }
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
          setRequestError({ code: "timeout", message: msg });
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
      if (!stillCurrentRequest()) {
        return;
      }
      const classified = classifyChatFetchError(err);
      const message =
        classified.code === "unknown" || classified.code === "upstream"
          ? classified.message || t("ai.requestFailed")
          : formatChatClientError(classified);
      setRequestError({ ...classified, message });
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
      // Do not clear loading if a newer send owns the controller / epoch.
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      if (requestEpoch === chatRequestEpochRef.current) {
        setIsLoading(false);
      }
    }
  };

  const vehicleLabel = currentVehicle
    ? `${currentVehicle.year} ${currentVehicle.make} ${currentVehicle.model}`
    : undefined;

  const vehicleIdentityWarning = currentVehicle
    ? detectVehicleVpicYmmConflict(currentVehicle)
      ? t("vehicles.vpicYmmConflict")
      : currentVehicle.ymmUnverified || hasYmmUnverifiedTag(currentVehicle.tags)
        ? t("vehicles.ymmUnverified")
        : null
    : null;

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

  const sendToAi = async (
    content: string,
    images?: string[],
    vehicleOverride?: VehicleInfo | null,
  ) => {
    if (isLoading) return;
    const active = vehicleOverride || currentVehicle;
    if (!active) {
      const lang = resolveGateLanguage("", i18n.language);
      setGateBanner({
        code: "no_vehicle_selected",
        message: gateCopy(lang, "gateNoVehicle"),
        lang,
      });
      return;
    }

    const photoList = (images ?? []).filter(Boolean).slice(0, CHAT_VISION_MAX_IMAGES);
    const finalContent = expandDtcIfNeeded(content.trim());
    if (!finalContent && photoList.length === 0) return;

    if (vehicleOverride && currentVehicle && vehicleOverride.id !== currentVehicle.id) {
      await queueSendAfterVehicleSwitch(vehicleOverride, finalContent, photoList);
      return;
    }

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

  /**
   * Switch to target vehicle without appending the pending question to the old thread.
   * Question is queued until the new vehicle's history finishes loading.
   */
  const queueSendAfterVehicleSwitch = async (
    target: VehicleInfo,
    content: string,
    images: string[],
  ) => {
    abortInFlightForContextSwitch();

    if (currentVehicle) {
      await persistNow(currentVehicle.id, messagesRef.current);
    }

    pendingSendAfterLoadRef.current = {
      vehicleId: target.id,
      content,
      images,
    };
    // Force reload even if somehow same key
    loadedKeyRef.current = null;
    setMessages([createWelcomeMessage()]);
    setMaintenanceSummary("");
    pendingVehicleThreadResetRef.current = true;
    delete threadIdByVehicleRef.current[target.id];
    setVehicleIsolatedToast(true);
    saveChatFocus(target.id, {
      vehicleId: target.id,
      recent: [],
      apiHistoryFromId: null,
      abandonedFocus: null,
    });
    await onVehicleChange(target);
    saveCurrentVehicleId(target.id);
  };

  const handleSend = async (content: string, images?: string[]) => {
    if (isLoading) return;

    const photoList = (images ?? []).filter(Boolean).slice(0, CHAT_VISION_MAX_IMAGES);
    const finalContent = expandDtcIfNeeded(content.trim());
    if (!finalContent && photoList.length === 0) return;
    if (isPhotoPromptWithoutImages(finalContent, photoList)) return;

    if (!(await ensureConsent())) return;

    setGateBanner(null);
    setPendingGarageSwitch(null);
    setRequestError(null);

    const gate = resolveChatVehicleGate({
      text: finalContent,
      garage: vehicles,
      current: currentVehicle,
      canAddVehicle: features.canAddVehicle(vehicles.length),
      maxVehicles: features.maxVehicles,
    });

    const lang = resolveGateLanguage(finalContent, i18n.language);

    if (gate.code === "empty_garage") {
      setGateBanner({
        code: "empty_garage",
        message: gateCopy(lang, "gateEmptyGarage"),
        lang,
        pendingContent: finalContent,
        pendingImages: photoList,
      });
      return;
    }

    if (gate.code === "no_vehicle_selected") {
      setGateBanner({
        code: "no_vehicle_selected",
        message: gateCopy(lang, "gateNoVehicle"),
        lang,
        pendingContent: finalContent,
        pendingImages: photoList,
      });
      setShowVehicleSwitcher(true);
      return;
    }

    if (gate.code === "not_in_garage_can_add") {
      setGateBanner({
        code: "not_in_garage_can_add",
        message: gateCopy(lang, "gateNotInGarageAdd", {
          mention: gate.mentionLabel,
        }),
        lang,
        mentionLabel: gate.mentionLabel,
        makeHint: gate.makeHint,
        modelHint: gate.modelHint,
        pendingContent: finalContent,
        pendingImages: photoList,
      });
      return;
    }

    if (gate.code === "not_in_garage_limit") {
      setGateBanner({
        code: "not_in_garage_limit",
        message: gateCopy(
          lang,
          hideStorePurchaseUi()
            ? "gateNotInGarageLimitStore"
            : "gateNotInGarageLimit",
          { mention: gate.mentionLabel, count: gate.maxVehicles },
        ),
        lang,
        mentionLabel: gate.mentionLabel,
        pendingContent: finalContent,
        pendingImages: photoList,
      });
      return;
    }

    if (gate.code === "ambiguous") {
      setGateBanner({
        code: "ambiguous",
        message: gateCopy(lang, "ambiguousGarage", {
          mention: gate.mentionLabel,
        }),
        lang,
        mentionLabel: gate.mentionLabel,
        candidates: gate.candidates,
        pendingContent: finalContent,
        pendingImages: photoList,
      });
      return;
    }

    if (gate.code === "switch_confirm") {
      setPendingGarageSwitch({
        content: finalContent,
        images: photoList,
        vehicle: gate.vehicle,
        mentionLabel: gate.mentionLabel,
        lang,
      });
      return;
    }

    await sendToAi(finalContent, photoList, gate.vehicle);
  };

  const confirmGarageSwitchAndSend = async () => {
    const pending = pendingGarageSwitch;
    if (!pending) return;
    setPendingGarageSwitch(null);
    await queueSendAfterVehicleSwitch(
      pending.vehicle,
      pending.content,
      pending.images,
    );
  };

  const selectAmbiguousVehicleAndSend = async (vehicle: VehicleInfo) => {
    const banner = gateBanner;
    if (!banner?.pendingContent) return;
    const content = banner.pendingContent;
    const images = banner.pendingImages ?? [];
    setGateBanner(null);
    await queueSendAfterVehicleSwitch(vehicle, content, images);
  };

  const openAddFromGate = () => {
    const banner = gateBanner;
    setAddVehicleSeed({
      make: banner?.makeHint,
      model: banner?.modelHint,
      label: banner?.mentionLabel,
    });
    setAddVehicleOpen(true);
  };

  const handleAddVehicleFromGate = async (newVehicle: VehicleInfo) => {
    const pendingContent = gateBanner?.pendingContent;
    const pendingImages = gateBanner?.pendingImages ?? [];
    setGateBanner(null);
    setAddVehicleOpen(false);
    setAddVehicleSeed(null);

    if (currentVehicle) {
      await persistNow(currentVehicle.id, messagesRef.current);
    }

    try {
      const saved = await onAddVehicle(newVehicle);
      if (pendingContent) {
        pendingSendAfterLoadRef.current = {
          vehicleId: saved.id,
          content: pendingContent,
          images: pendingImages,
        };
        loadedKeyRef.current = null;
      }
      saveCurrentVehicleId(saved.id);
      if (!pendingContent) setPostSaveNudge(true);
    } catch (err) {
      console.error("[ChatApp] add vehicle from gate failed:", err);
      alert(
        err instanceof Error
          ? err.message
          : "Could not save vehicle to your garage. Please try again.",
      );
    }
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
        ...snapshot,
        vehicleLabel,
      }),
    );
  };

  const handleObdScreenshot = async (imageDataUrl: string) => {
    if (!currentVehicle) {
      alert("Add a vehicle to your garage before chatting.");
      return;
    }
    if (!(await ensureConsent())) return;
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
            reportLimitFallback: t(
              hideStorePurchaseUi()
                ? "shopReport.limitReachedStore"
                : "shopReport.limitReached",
            ),
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
      setRequestError({ code: "upstream", message });
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
    if (!ready || !currentVehicle || isLoading) return;
    const msgs = messagesRef.current;
    let cut = msgs.length;
    while (cut > 0 && msgs[cut - 1]?.role === "assistant") cut -= 1;
    const base = msgs.slice(0, cut);
    if (!base.length || base[base.length - 1]?.role !== "user") return;
    setMessages(base);
    const lastUser = base[base.length - 1];
    const photos = (lastUser.images ?? (lastUser.image ? [lastUser.image] : []))
      .filter(Boolean)
      .slice(0, CHAT_VISION_MAX_IMAGES);
    await runChatRequest(base, photos);
  };

  const handleEditUser = (content: string) => {
    setDraftValue(content);
  };

  const handleQuickPrompt = (prompt: string) => {
    void handleSend(prompt);
  };

  return (
    <div className="flex h-0 min-h-0 flex-1 overflow-hidden">
      <div className="hidden w-72 shrink-0 overflow-hidden border-r border-slate-800 bg-[#111827] xl:block xl:min-h-0">
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

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-800 bg-[#111827] px-3 py-2 xl:hidden">
          <button
            type="button"
            onClick={() => setShowVehicleSwitcher(true)}
            className="min-h-[44px] min-w-0 flex-1 touch-manipulation rounded-xl text-left active:bg-slate-800/50"
            data-testid="chat-vehicle-switcher-open"
          >
            <VehiclePanel vehicle={currentVehicle} isMobile />
          </button>
          <div className="flex shrink-0 items-center gap-1.5">
            {currentVehicle && (
              <>
                <button
                  type="button"
                  data-testid="chat-topics-open"
                  onClick={() => void openThreadSheet()}
                  className="inline-flex min-h-[44px] touch-manipulation items-center gap-1 rounded-xl border border-slate-700 px-2.5 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800"
                  title={t("ai.topics")}
                >
                  <ListTree className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{t("ai.topics")}</span>
                </button>
                <button
                  type="button"
                  data-testid="chat-new-topic"
                  onClick={() => void handleNewTopic()}
                  className="inline-flex min-h-[44px] touch-manipulation items-center gap-1 rounded-xl border border-slate-700 px-2.5 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800"
                  title={t("ai.newTopic")}
                >
                  <MessageSquarePlus className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{t("ai.newTopic")}</span>
                </button>
                <button
                  type="button"
                  data-testid="shop-report-open"
                  onClick={() => setShopReportOpen(true)}
                  className="inline-flex min-h-[44px] touch-manipulation items-center gap-1 rounded-xl border border-slate-700 px-3 py-2 text-xs font-medium text-cyan-300 hover:bg-slate-800"
                  title={t("shopReport.openCta")}
                >
                  <FileText className="h-3.5 w-3.5" />
                  {t("shopReport.headerCta")}
                </button>
              </>
            )}
            {isFree && <UpgradeButton size="sm" label="Pro" />}
          </div>
        </div>
        {vehicleIdentityWarning ? (
          <p
            data-testid="chat-vehicle-identity-warning"
            className="border-b border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-[11px] leading-snug text-amber-100 xl:hidden"
          >
            {vehicleIdentityWarning}
          </p>
        ) : null}

        <div className="hidden items-center justify-between gap-3 border-b border-slate-800 bg-[#111827] px-4 py-3 xl:flex">
          <div className="min-w-0 flex-1 truncate text-sm text-slate-400">
            {vehiclesLoading ? (
              "Loading garage…"
            ) : currentVehicle ? (
              <>
                <span className="font-medium text-slate-200">
                  {t("ai.sessionTitle", {
                    vehicle: formatVehicleYmmDisplay(currentVehicle),
                  })}
                </span>
                {currentVehicle.name ? (
                  <span className="ml-2 hidden text-xs text-slate-500 2xl:inline">
                    · {currentVehicle.name}
                  </span>
                ) : null}
                {vehicleIdentityWarning ? (
                  <span
                    data-testid="chat-vehicle-identity-warning-desktop"
                    className="mt-1 block truncate text-[11px] text-amber-200/90"
                  >
                    {vehicleIdentityWarning}
                  </span>
                ) : null}
              </>
            ) : (
              t("ai.gateNoVehicle")
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {currentVehicle && (
              <>
                <button
                  type="button"
                  data-testid="chat-topics-open-desktop"
                  onClick={() => void openThreadSheet()}
                  className="inline-flex min-h-[44px] touch-manipulation items-center gap-1.5 rounded-xl border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800"
                >
                  <ListTree className="h-3.5 w-3.5" />
                  {t("ai.topics")}
                </button>
                <button
                  type="button"
                  data-testid="chat-new-topic-desktop"
                  onClick={() => void handleNewTopic()}
                  className="inline-flex min-h-[44px] touch-manipulation items-center gap-1.5 rounded-xl border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800"
                >
                  <MessageSquarePlus className="h-3.5 w-3.5" />
                  {t("ai.newTopic")}
                </button>
                <button
                  type="button"
                  data-testid="shop-report-open-desktop"
                  onClick={() => setShopReportOpen(true)}
                  className="inline-flex min-h-[44px] touch-manipulation items-center gap-1.5 rounded-xl border border-slate-700 px-3 py-2 text-xs font-semibold text-cyan-300 hover:bg-slate-800"
                >
                  <FileText className="h-3.5 w-3.5" />
                  {t("shopReport.openCta")}
                </button>
              </>
            )}
            {isFree && <UpgradeButton label="Upgrade to Pro" />}
          </div>
        </div>

        <MessageList
          messages={messages.filter((m) => !hiddenEmptyPhotoIds.includes(m.id))}
          isLoading={isLoading}
          vehicle={currentVehicle ?? undefined}
          onGoToInventory={onGoToInventory}
          onOpenFocus={onFocusDetected}
          onRegenerate={() => void handleRegenerate()}
          onEditUser={handleEditUser}
          onQuickPrompt={handleQuickPrompt}
          onOpenPlaybook={onOpenPlaybook}
          onGenerateShopReport={() => setShopReportOpen(true)}
          onHideEmptyPhoto={(id) =>
            setHiddenEmptyPhotoIds((prev) =>
              prev.includes(id) ? prev : [...prev, id],
            )
          }
          sessionSafety={sessionSafety}
          showDisclaimerBanner={chatDisclaimer.showBanner}
          disclaimerMode={chatDisclaimer.bannerMode}
          onDisclaimerGotIt={() => void chatDisclaimer.dismiss()}
          onDisclaimerLearnMore={chatDisclaimer.openSheet}
        />
        {gateBanner ? (
          <div
            className="shrink-0 border-t border-amber-800/50 bg-amber-950/45 px-3 py-3 sm:px-4"
            data-testid="chat-gate-banner"
            data-gate-code={gateBanner.code}
            data-gate-lang={gateBanner.lang}
          >
            <div className="mx-auto flex max-h-[min(42dvh,22rem)] max-w-3xl flex-col gap-2 overflow-y-auto overscroll-contain">
              <p className="text-sm leading-relaxed text-amber-50">
                {gateBanner.message}
              </p>
              {gateBanner.code === "empty_garage" ? (
                <div
                  className="rounded-xl border border-amber-800/60 bg-amber-950/40 px-3 py-2"
                  data-testid="chat-empty-garage-diy"
                >
                  <p className="text-xs leading-snug text-amber-100/90">
                    {EMPTY_GARAGE_DIY_HEADLINE}
                  </p>
                  <ol className="mt-1.5 list-decimal space-y-0.5 pl-4 text-[11px] leading-snug text-amber-100/75">
                    {EMPTY_GARAGE_DIY_STEPS.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                </div>
              ) : null}
              {gateBanner.code === "ambiguous" && gateBanner.candidates?.length ? (
                <div
                  className="flex max-h-[28dvh] flex-col gap-2 overflow-y-auto overscroll-contain sm:max-h-none sm:flex-row sm:flex-wrap"
                  data-testid="chat-gate-ambiguous-list"
                >
                  {gateBanner.candidates.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      data-testid="chat-gate-pick"
                      onClick={() => void selectAmbiguousVehicleAndSend(v)}
                      className={`${GATE_CTA_SECONDARY} w-full justify-start sm:w-auto`}
                    >
                      {formatVehicleShort(v)}
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2 pb-[max(0.25rem,env(safe-area-inset-bottom))] sm:pb-0">
                {(gateBanner.code === "empty_garage" ||
                  gateBanner.code === "not_in_garage_can_add") && (
                  <button
                    type="button"
                    data-testid="chat-gate-add-vehicle"
                    onClick={openAddFromGate}
                    className={GATE_CTA_PRIMARY}
                  >
                    {gateCopy(gateBanner.lang, "gateAddVehicle")}
                  </button>
                )}
                {gateBanner.code === "not_in_garage_limit" && (
                  <>
                    {!hideStorePurchaseUi() ? (
                      <button
                        type="button"
                        data-testid="chat-gate-upgrade"
                        onClick={() => {
                          setUpgradeReason("vehicles");
                          setUpgradeOpen(true);
                        }}
                        className={GATE_CTA_PRIMARY}
                      >
                        {gateCopy(gateBanner.lang, "gateUpgrade")}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      data-testid="chat-gate-manage"
                      onClick={() => setShowVehicleSwitcher(true)}
                      className={GATE_CTA_SECONDARY}
                    >
                      {gateCopy(gateBanner.lang, "gateManageGarage")}
                    </button>
                  </>
                )}
                {(gateBanner.code === "no_vehicle_selected" ||
                  gateBanner.code === "ambiguous") && (
                  <button
                    type="button"
                    data-testid="chat-gate-pick-open"
                    onClick={() => setShowVehicleSwitcher(true)}
                    className={GATE_CTA_SECONDARY}
                  >
                    {gateCopy(gateBanner.lang, "gatePickVehicle")}
                  </button>
                )}
                <button
                  type="button"
                  data-testid="chat-gate-dismiss"
                  onClick={() => setGateBanner(null)}
                  className={GATE_CTA_GHOST}
                >
                  {gateCopy(gateBanner.lang, "switchConfirmNo")}
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {pendingGarageSwitch && currentVehicle ? (
          <div
            className="shrink-0 border-t border-cyan-800/50 bg-cyan-950/50 px-3 py-3 sm:px-4"
            data-testid="chat-gate-switch"
            data-gate-lang={pendingGarageSwitch.lang}
          >
            <div className="mx-auto flex max-h-[min(42dvh,22rem)] max-w-3xl flex-col gap-3 overflow-y-auto overscroll-contain sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm leading-relaxed text-cyan-50">
                {gateCopy(pendingGarageSwitch.lang, "switchConfirm", {
                  mention: pendingGarageSwitch.mentionLabel,
                  vehicle: formatVehicleShort(pendingGarageSwitch.vehicle),
                  current: formatVehicleShort(currentVehicle),
                })}
              </p>
              <div className="flex shrink-0 flex-wrap gap-2">
                <button
                  type="button"
                  data-testid="chat-gate-switch-no"
                  onClick={() => setPendingGarageSwitch(null)}
                  className={GATE_CTA_SECONDARY}
                >
                  {gateCopy(pendingGarageSwitch.lang, "switchConfirmNo")}
                </button>
                <button
                  type="button"
                  data-testid="chat-gate-switch-yes"
                  onClick={() => void confirmGarageSwitchAndSend()}
                  className={GATE_CTA_PRIMARY}
                >
                  {gateCopy(pendingGarageSwitch.lang, "switchConfirmYes")}
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {vehicleIsolatedToast ? (
          <div
            className="shrink-0 border-t border-slate-700/60 bg-slate-900/80 px-3 py-2 sm:px-4"
            data-testid="chat-vehicle-isolated-toast"
            role="status"
          >
            <div className="mx-auto flex max-w-3xl items-center justify-between gap-2">
              <p className="text-sm text-slate-200">
                {t("ai.vehicleThreadIsolated")}
              </p>
              <button
                type="button"
                data-testid="chat-vehicle-isolated-dismiss"
                onClick={() => setVehicleIsolatedToast(false)}
                className={GATE_CTA_GHOST}
              >
                {t("ai.topicHintDismiss")}
              </button>
            </div>
          </div>
        ) : null}
        {newTopicToast ? (
          <div
            className="shrink-0 border-t border-slate-700/60 bg-slate-900/80 px-3 py-2 sm:px-4"
            data-testid="chat-new-topic-toast"
            role="status"
          >
            <div className="mx-auto flex max-w-3xl items-center justify-between gap-2">
              <p className="text-sm text-slate-200">{t("ai.newTopicToast")}</p>
              <button
                type="button"
                data-testid="chat-new-topic-toast-dismiss"
                onClick={() => setNewTopicToast(false)}
                className={GATE_CTA_GHOST}
              >
                {t("ai.topicHintDismiss")}
              </button>
            </div>
          </div>
        ) : null}
        {manualNudgeOpen &&
        currentVehicle &&
        !hasSearchableManual &&
        !newTopicToast &&
        !vehicleIsolatedToast ? (
          <div
            className="shrink-0 border-t border-cyan-900/40 bg-cyan-950/30 px-3 py-2 sm:px-4"
            data-testid="chat-manual-nudge"
            role="status"
          >
            <div className="mx-auto flex max-w-3xl flex-col gap-2">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs leading-snug text-cyan-50/90">
                  {t("ai.manualNudge")}
                </p>
                <div className="flex shrink-0 flex-wrap items-center gap-1">
                  <button
                    type="button"
                    data-testid="chat-manual-nudge-upload"
                    onClick={() => {
                      setManualNudgeOpen(false);
                      setManualNudgeNoCopyOpen(false);
                      setManualUploadOpen(true);
                    }}
                    className={GATE_CTA_PRIMARY}
                  >
                    {t("ai.manualNudgeUpload")}
                  </button>
                  <button
                    type="button"
                    data-testid="chat-manual-nudge-dismiss"
                    onClick={() => {
                      dismissManualNudge(currentVehicle.id);
                      setManualNudgeOpen(false);
                      setManualNudgeNoCopyOpen(false);
                    }}
                    className={GATE_CTA_GHOST}
                  >
                    {t("ai.manualNudgeDismiss")}
                  </button>
                  <button
                    type="button"
                    data-testid="chat-manual-nudge-no-copy"
                    onClick={() =>
                      setManualNudgeNoCopyOpen((open) => !open)
                    }
                    className="min-h-[44px] touch-manipulation px-2 text-[11px] text-cyan-200/80 underline-offset-2 hover:underline"
                  >
                    {t("ai.manualNudgeNoCopy")}
                  </button>
                </div>
              </div>
              {manualNudgeNoCopyOpen ? (
                <div
                  className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
                  data-testid="chat-manual-nudge-no-copy-hint"
                >
                  <p className="text-[11px] leading-snug text-slate-300">
                    {t("ai.manualNudgeNoCopyHint")}
                  </p>
                  <button
                    type="button"
                    data-testid="chat-manual-nudge-no-copy-ack"
                    onClick={() => {
                      dismissManualNudgeNoCopy(currentVehicle.id);
                      setManualNudgeOpen(false);
                      setManualNudgeNoCopyOpen(false);
                    }}
                    className={GATE_CTA_GHOST}
                  >
                    {t("ai.manualNudgeDismiss")}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
        {(pendingOilExtracts > 0 ||
          pendingCoolantExtracts > 0 ||
          pendingBrakeExtracts > 0) &&
        currentVehicle &&
        !extractBadgeDismissed &&
        !manualNudgeOpen &&
        !newTopicToast &&
        !vehicleIsolatedToast ? (
          <div
            className="shrink-0 border-t border-cyan-900/40 bg-cyan-950/25 px-3 py-2 sm:px-4"
            data-testid="chat-manual-extract-badge"
            role="status"
          >
            <div className="mx-auto flex max-w-3xl items-center justify-between gap-2">
              <p className="text-xs leading-snug text-cyan-50/90">
                {[
                  pendingOilExtracts > 0,
                  pendingCoolantExtracts > 0,
                  pendingBrakeExtracts > 0,
                ].filter(Boolean).length > 1
                  ? t("ai.manualExtractBadgeBoth")
                  : pendingBrakeExtracts > 0
                    ? t("ai.manualExtractBadgeBrake")
                    : pendingCoolantExtracts > 0
                      ? t("ai.manualExtractBadgeCoolant")
                      : t("ai.manualExtractBadge")}
              </p>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  data-testid="chat-manual-extract-review"
                  onClick={() => setManualUploadOpen(true)}
                  className={GATE_CTA_PRIMARY}
                >
                  {t("ai.manualExtractReview")}
                </button>
                <button
                  type="button"
                  data-testid="chat-manual-extract-dismiss"
                  onClick={() => setExtractBadgeDismissed(true)}
                  className={GATE_CTA_GHOST}
                >
                  {t("ai.manualNudgeDismiss")}
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {!topicHintDismissed &&
        !newTopicToast &&
        !vehicleIsolatedToast &&
        !manualNudgeOpen &&
        pendingOilExtracts === 0 &&
        pendingCoolantExtracts === 0 &&
        pendingBrakeExtracts === 0 &&
        messages.filter((m) => m.id !== "welcome").length >= 6 ? (
          <div
            className="shrink-0 border-t border-slate-800/80 bg-slate-950/40 px-3 py-2 sm:px-4"
            data-testid="chat-topic-hint"
            role="status"
          >
            <div className="mx-auto flex max-w-3xl items-center justify-between gap-2">
              <p className="text-xs leading-snug text-slate-400">
                {t("ai.topicHint")}
              </p>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  data-testid="chat-topic-hint-new"
                  onClick={() => void handleNewTopic()}
                  className={GATE_CTA_SECONDARY}
                >
                  {t("ai.newTopic")}
                </button>
                <button
                  type="button"
                  data-testid="chat-topic-hint-dismiss"
                  onClick={() => setTopicHintDismissed(true)}
                  className={GATE_CTA_GHOST}
                >
                  {t("ai.topicHintDismiss")}
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {postSaveNudge && currentVehicle ? (
          <div
            className="shrink-0 border-t border-cyan-800/50 bg-cyan-950/40 px-3 py-3 sm:px-4"
            data-testid="chat-post-save-nudge"
          >
            <div className="mx-auto max-w-3xl">
              <p className="text-sm leading-relaxed text-cyan-50">
                {POST_SAVE_NUDGE_COPY}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {getUsHighFreqDtcChips().map((chip) => (
                  <button
                    key={chip.code}
                    type="button"
                    data-testid={`chat-post-save-dtc-${chip.code}`}
                    onClick={() => {
                      setPostSaveNudge(false);
                      handleFaultCode(chip.code);
                    }}
                    className={GATE_CTA_SECONDARY}
                  >
                    {chip.code}
                  </button>
                ))}
                <button
                  type="button"
                  data-testid="chat-post-save-enter-code"
                  onClick={() => setPostSaveDtcOpen(true)}
                  className={GATE_CTA_PRIMARY}
                >
                  Enter a code
                </button>
                <button
                  type="button"
                  data-testid="chat-post-save-dismiss"
                  onClick={() => setPostSaveNudge(false)}
                  className={GATE_CTA_GHOST}
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {requestError && !isLoading ? (
          <div className="shrink-0 border-t border-amber-800/40 bg-amber-950/40 px-3 py-2.5 sm:px-4">
            <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-amber-100">
                <span className="mr-2 rounded bg-amber-900/80 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-amber-200">
                  {requestError.code}
                </span>
                {requestError.message}
              </p>
              <button
                type="button"
                onClick={() => {
                  setRequestError(null);
                  void handleRegenerate();
                }}
                className={GATE_CTA_PRIMARY}
              >
                {gateCopy(
                  resolveGateLanguage("", i18n.language),
                  "retry",
                )}
              </button>
            </div>
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
          isLoading={vehiclesLoading || !ready}
          isGenerating={isLoading}
          autoSpeak={autoSpeak}
          onAutoSpeakChange={setAutoSpeak}
          onStop={handleStop}
          draftValue={draftValue}
          onDraftConsumed={() => setDraftValue(undefined)}
          onOpenSafetyNotes={chatDisclaimer.openSheet}
        />
      </div>

      <ChatSafetyNotesSheet
        open={chatDisclaimer.sheetOpen}
        onClose={chatDisclaimer.closeSheet}
        sessionSafety={sessionSafety}
        onGenerateShopReport={() => {
          chatDisclaimer.closeSheet();
          setShopReportOpen(true);
        }}
      />

      <ReceiptConfirmModal
        open={receiptModalOpen}
        onClose={() => setReceiptModalOpen(false)}
        vehicles={vehicles}
        defaultVehicleId={currentVehicle?.id}
        mode="scan"
        onSaved={handleReceiptSaved}
      />

      <DtcCodeModal
        open={postSaveDtcOpen}
        onClose={() => setPostSaveDtcOpen(false)}
        onSubmit={(code) => {
          setPostSaveDtcOpen(false);
          setPostSaveNudge(false);
          handleFaultCode(code);
        }}
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
              imageAnalysis: m.imageAnalysis
                ? { dtc_codes: m.imageAnalysis.dtc_codes }
                : null,
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

      <AddVehicleModal
        open={addVehicleOpen}
        onClose={() => {
          setAddVehicleOpen(false);
          setAddVehicleSeed(null);
        }}
        seedHint={addVehicleSeed}
        onAdd={(v) => void handleAddVehicleFromGate(v)}
      />

      {manualUploadOpen && currentVehicle ? (
        <div
          className="fixed inset-0 z-50"
          role="dialog"
          aria-modal="true"
          aria-label={t("vehicles.manualTitle")}
          data-testid="chat-manual-upload-sheet"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/60"
            aria-label="Close"
            onClick={() => setManualUploadOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[min(78dvh,36rem)] overflow-y-auto rounded-t-2xl border border-slate-700 bg-[#111827] p-4 shadow-2xl sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-100">
                {t("vehicles.manualTitle")}
              </h2>
              <button
                type="button"
                onClick={() => setManualUploadOpen(false)}
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-slate-400 hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <VehicleManualPanel
              vehicle={currentVehicle}
              onChanged={(m) => {
                setHasSearchableManual(Boolean(m?.searchable));
                if (m?.searchable) {
                  setManualNudgeOpen(false);
                }
              }}
              onExtractsChanged={(rows) => {
                const oil = rows.filter(
                  (ex) =>
                    (ex.kind || "oil") === "oil" ||
                    ex.field === "viscosity" ||
                    ex.field === "capacity",
                ).length;
                const coolant = rows.filter(
                  (ex) =>
                    ex.kind === "coolant" ||
                    String(ex.field || "").startsWith("coolant_"),
                ).length;
                const brake = rows.filter(
                  (ex) =>
                    ex.kind === "brake_fluid" ||
                    String(ex.field || "").startsWith("brake_fluid_"),
                ).length;
                setPendingOilExtracts(oil);
                setPendingCoolantExtracts(coolant);
                setPendingBrakeExtracts(brake);
              }}
              onFluidsSaved={(v) => void onVehicleChange(v)}
            />
          </div>
        </div>
      ) : null}

      <UpgradeModal
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        reason={upgradeReason}
      />

      {threadSheetOpen ? (
        <div
          className="fixed inset-0 z-50"
          role="dialog"
          aria-modal="true"
          aria-label={t("ai.topicsTitle")}
          data-testid="chat-topics-sheet"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/60"
            aria-label="Close"
            onClick={() => setThreadSheetOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[min(72dvh,32rem)] overflow-hidden rounded-t-2xl border border-slate-700 bg-[#111827] shadow-2xl sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-100">
                {t("ai.topicsTitle")}
              </h2>
              <button
                type="button"
                data-testid="chat-topics-close"
                onClick={() => setThreadSheetOpen(false)}
                className="inline-flex min-h-[44px] min-w-[44px] touch-manipulation items-center justify-center rounded-xl text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="max-h-[min(56dvh,24rem)] overflow-y-auto overscroll-contain p-3">
              <button
                type="button"
                data-testid="chat-topics-new"
                onClick={() => void handleNewTopic()}
                className="mb-3 flex w-full min-h-[44px] touch-manipulation items-center justify-center gap-2 rounded-xl border border-cyan-800/60 bg-cyan-950/40 px-3 py-2.5 text-sm font-medium text-cyan-100 hover:bg-cyan-950/70"
              >
                <MessageSquarePlus className="h-4 w-4" />
                {t("ai.newTopic")}
              </button>
              {threadList.length === 0 ? (
                <p className="px-1 py-4 text-center text-sm text-slate-500">
                  {t("ai.topicEmpty")}
                </p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {threadList.map((thread) => {
                    const active = thread.id === activeThreadId;
                    return (
                      <li key={thread.id}>
                        <button
                          type="button"
                          data-testid="chat-topic-item"
                          data-thread-id={thread.id}
                          data-active={active ? "true" : "false"}
                          onClick={() => void handleSelectThread(thread.id)}
                          className={`flex w-full min-h-[44px] touch-manipulation flex-col items-start gap-0.5 rounded-xl border px-3 py-2.5 text-left ${
                            active
                              ? "border-cyan-700/70 bg-cyan-950/35 text-cyan-50"
                              : "border-slate-800 bg-slate-900/40 text-slate-200 hover:bg-slate-800/60"
                          }`}
                        >
                          <span className="line-clamp-2 text-sm font-medium">
                            {thread.displayTitle}
                          </span>
                          <span className="text-[11px] text-slate-500">
                            {active ? t("ai.topicActive") : null}
                            {active ? " · " : null}
                            {new Date(
                              thread.updatedAt || thread.createdAt,
                            ).toLocaleString()}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
