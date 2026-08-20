"use client";

import { useEffect, useRef, useState } from "react";
import {
  Send,
  Camera,
  Image as ImageIcon,
  X,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Square,
  FileText,
  Plus,
} from "lucide-react";
import {
  isSpeechSynthesisSupported,
  saveAutoSpeakPreference,
  stopSpeaking,
} from "@/lib/browser-voice";
import { useSubscription } from "@/hooks/useSubscription";
import { useTokenUsage } from "@/hooks/useTokenUsage";
import UpgradeModal, {
  type UpgradeReason,
} from "@/components/ui/UpgradeModal";
import { isQaUnlockEnabled } from "@/lib/qa-mode";
import { hideStorePurchaseUi } from "@/lib/native-platform";
import CameraCapture from "@/components/chat/CameraCapture";
import DtcEntryBar from "@/components/chat/DtcEntryBar";
import { compressImageDataUrl } from "@/lib/image";
import { DEFAULT_PHOTO_PROMPT } from "@/lib/chat-empty-photo";
import { MAX_PHOTO_DIAGNOSE_IMAGES } from "@/lib/types/subscription";
import type { ObdSessionSnapshot } from "@/lib/types/obd-session";
import type { MileageUnit } from "@/lib/obd-mileage";

interface Props {
  onSend: (content: string, images?: string[]) => void;
  /** Manual P/C/B/U fault code entry */
  onFaultCode?: (code: string) => void;
  /** OBD scanner screenshot → vision extract → diagnosis */
  onObdScreenshot?: (imageDataUrl: string) => void | Promise<void>;
  /** BLE OBD connect → DTCs/sensors → diagnosis */
  onObdBleSession?: (snapshot: ObdSessionSnapshot) => void;
  vehicleId?: string | null;
  onMileageSynced?: (result: { mileage: number; unit: MileageUnit }) => void;
  /** Open receipt / invoice scan → confirm → maintenance history */
  onScanReceipt?: () => void;
  /** Composer disabled (no vehicle / not ready) */
  isLoading: boolean;
  /** True only while a reply is generating (shows Stop) */
  isGenerating?: boolean;
  autoSpeak: boolean;
  onAutoSpeakChange: (enabled: boolean) => void;
  /** Stop in-flight chat request */
  onStop?: () => void;
  /** Prefill composer (edit / quick prompts) */
  draftValue?: string;
  onDraftConsumed?: () => void;
  /** Open Educational guidance · Safety notes sheet */
  onOpenSafetyNotes?: () => void;
}

type SpeechRecognitionResultEvent = {
  results: { [index: number]: { [index: number]: { transcript: string } } };
};

type SpeechRecognitionError = {
  error: string;
};

type SpeechRecognitionInstance = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionError) => void) | null;
};

function getSpeechRecognitionCtor():
  | (new () => SpeechRecognitionInstance)
  | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as Window & {
    SpeechRecognition?: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition;
}

export default function ChatInput({
  onSend,
  onFaultCode,
  onObdScreenshot,
  onObdBleSession,
  vehicleId,
  onMileageSynced,
  onScanReceipt,
  isLoading,
  isGenerating = false,
  autoSpeak,
  onAutoSpeakChange,
  onStop,
  draftValue,
  onDraftConsumed,
  onOpenSafetyNotes,
}: Props) {
  const busy = isLoading || isGenerating;
  const [input, setInput] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [ttsSupported, setTtsSupported] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [upgradeReason, setUpgradeReason] =
    useState<UpgradeReason>("generic");
  const [toolsOpen, setToolsOpen] = useState(false);

  const { isFree, features, recordVoiceUse, recordPhotoDiagnose } =
    useSubscription();
  const { usage } = useTokenUsage();

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const onSendRef = useRef(onSend);
  const isLoadingRef = useRef(isLoading);
  const canUseVoiceRef = useRef(features.canUseVoice);
  const recordVoiceUseRef = useRef(recordVoiceUse);
  const inputRef = useRef(input);

  useEffect(() => {
    if (draftValue == null) return;
    setInput(draftValue);
    onDraftConsumed?.();
    window.setTimeout(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
    }, 0);
  }, [draftValue, onDraftConsumed]);

  const tokensExhausted =
    !usage.unlimited &&
    !isQaUnlockEnabled() &&
    usage.signedIn &&
    usage.remainingThisMonth <= 0;

  useEffect(() => {
    onSendRef.current = onSend;
    isLoadingRef.current = busy;
    canUseVoiceRef.current = features.canUseVoice;
    recordVoiceUseRef.current = recordVoiceUse;
    inputRef.current = input;
  }, [onSend, busy, features.canUseVoice, recordVoiceUse, input]);

  const showUpgrade = (reason: UpgradeReason) => {
    setUpgradeReason(reason);
    setUpgradeOpen(true);
  };

  useEffect(() => {
    setTtsSupported(isSpeechSynthesisSupported());

    const SpeechRecognition = getSpeechRecognitionCtor();
    if (!SpeechRecognition) {
      setVoiceSupported(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => {
      setVoiceError(null);
      setIsListening(true);
      stopSpeaking();
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.onerror = (event) => {
      setIsListening(false);
      if (event.error === "not-allowed") {
        setVoiceError(
          "Microphone access denied. Enable mic in browser settings.",
        );
      } else if (event.error !== "aborted") {
        setVoiceError("Voice input failed. Try again or type your message.");
      }
    };

    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim();
      if (!transcript || isLoadingRef.current) return;

      if (!canUseVoiceRef.current) {
        showUpgrade("voice");
        return;
      }

      if (!recordVoiceUseRef.current()) {
        showUpgrade("voice");
        return;
      }

      // Draft into composer (ChatGPT-style) — user reviews before send
      setInput((prev) => {
        const next = prev.trim() ? `${prev.trim()} ${transcript}` : transcript;
        inputRef.current = next;
        return next;
      });
      window.setTimeout(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.focus();
        el.style.height = "auto";
        el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
      }, 0);
    };

    recognitionRef.current = recognition;
    setVoiceSupported(true);

    return () => {
      recognition.abort();
      recognitionRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (busy && isListening && recognitionRef.current) {
      recognitionRef.current.stop();
    }
  }, [busy, isListening]);

  const toggleVoiceInput = () => {
    if (!features.canUseVoice) {
      showUpgrade("voice");
      return;
    }

    const recognition = recognitionRef.current;
    if (!recognition || busy) return;

    if (isListening) {
      recognition.stop();
    } else {
      setVoiceError(null);
      try {
        recognition.start();
      } catch {
        setVoiceError("Could not start microphone. Tap again.");
      }
    }
  };

  const toggleAutoSpeak = () => {
    if (!features.voiceEnabled) {
      showUpgrade("voice");
      return;
    }
    const next = !autoSpeak;
    onAutoSpeakChange(next);
    saveAutoSpeakPreference(next);
    if (!next) stopSpeaking();
  };

  const ensurePhotoQuota = (): boolean => {
    if (features.canUsePhotoDiagnose && recordPhotoDiagnose()) return true;
    showUpgrade("photo");
    return false;
  };

  const sendWithPhotos = (photos: string[], note?: string) => {
    if (busy) return;
    if (isFree && tokensExhausted) {
      showUpgrade("tokens");
      return;
    }
    if (photos.length > 0 && !ensurePhotoQuota()) return;

    const text =
      note?.trim() ||
      (photos.length > 0 ? DEFAULT_PHOTO_PROMPT : "");
    if (!text && photos.length === 0) return;

    stopSpeaking();
    onSend(text, photos.length ? photos : undefined);
    setInput("");
    setImages([]);
  };

  const handleSubmit = () => {
    sendWithPhotos(images, input);
  };

  const addCompressedPhoto = async (raw: string, autoSend: boolean) => {
    const compressed = await compressImageDataUrl(raw, {
      maxWidth: 1600,
      maxHeight: 1600,
      quality: 0.82,
    });

    if (autoSend) {
      // Camera → send immediately (garage one-handed flow)
      const note = inputRef.current.trim();
      sendWithPhotos([compressed], note || undefined);
      return;
    }

    setImages((prev) => {
      if (prev.length >= MAX_PHOTO_DIAGNOSE_IMAGES) {
        alert(
          `You can attach up to ${MAX_PHOTO_DIAGNOSE_IMAGES} photos per diagnose. Remove one, or send these to AI first.`,
        );
        return prev;
      }
      return [...prev, compressed];
    });
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;

    const room = MAX_PHOTO_DIAGNOSE_IMAGES - images.length;
    if (room <= 0) {
      alert(
        `You can attach up to ${MAX_PHOTO_DIAGNOSE_IMAGES} photos per diagnose.`,
      );
      return;
    }

    void (async () => {
      for (const file of files.slice(0, room)) {
        const raw = await new Promise<string | null>((resolve) => {
          const reader = new FileReader();
          reader.onload = (ev) => resolve((ev.target?.result as string) ?? null);
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(file);
        });
        if (raw) await addCompressedPhoto(raw, false);
      }
    })();
  };

  const openGallery = () => {
    galleryInputRef.current?.click();
  };

  const openCamera = () => {
    if (busy) return;
    if (!features.canUsePhotoDiagnose) {
      showUpgrade("photo");
      return;
    }
    if (
      typeof navigator !== "undefined" &&
      typeof navigator.mediaDevices?.getUserMedia === "function"
    ) {
      setCameraOpen(true);
      return;
    }
    openGallery();
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const showMic = voiceSupported;
  const showTts = ttsSupported;
  const photoRemainingLabel =
    features.photoRemainingToday == null
      ? null
      : `${features.photoRemainingToday} photo diagnose${
          features.photoRemainingToday === 1 ? "" : "s"
        } left today`;

  return (
    <div className="panel-scroll max-h-[min(48dvh,22rem)] shrink-0 overflow-y-auto overscroll-y-contain border-t border-slate-800 bg-[#111827] p-3 pb-[max(0.75rem,var(--content-pad-bottom))] sm:max-h-none sm:overflow-visible sm:p-4 lg:pb-[max(1rem,env(safe-area-inset-bottom))]">
      <UpgradeModal
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        reason={upgradeReason}
      />

      <CameraCapture
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={(dataUrl) => {
          void addCompressedPhoto(dataUrl, true);
        }}
        onPickGallery={openGallery}
      />

      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleImageUpload}
      />

      {toolsOpen ? (
        <div data-testid="chat-composer-tools">
          {onFaultCode && onObdScreenshot ? (
            <DtcEntryBar
              variant="chat"
              disabled={busy}
              onCodeSubmit={onFaultCode}
              onObdImage={async (img) => {
                if (!ensurePhotoQuota()) return;
                await onObdScreenshot(img);
              }}
              onObdBleSession={onObdBleSession}
              vehicleId={vehicleId}
              onMileageSynced={onMileageSynced}
            />
          ) : null}
          <div
            className={
              onScanReceipt ? "mb-3 grid grid-cols-2 gap-2" : "mb-3"
            }
          >
            <button
              type="button"
              onClick={openCamera}
              disabled={busy}
              data-testid="chat-tool-photo"
              className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-cyan-500 px-3 text-sm font-semibold text-black transition hover:bg-cyan-400 disabled:opacity-50"
            >
              <Camera className="h-4 w-4" />
              Photo
            </button>
            {onScanReceipt ? (
              <button
                type="button"
                onClick={onScanReceipt}
                disabled={busy}
                data-testid="chat-tool-report"
                className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-slate-600 bg-slate-900/80 px-3 text-sm font-medium text-slate-100 transition hover:border-cyan-500/40 disabled:opacity-50"
              >
                <FileText className="h-4 w-4 text-cyan-400" />
                Report
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {images.length > 0 && (
        <div className="mb-3">
          <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
            <span>
              {images.length}/{MAX_PHOTO_DIAGNOSE_IMAGES} photos ready
            </span>
            <button
              type="button"
              onClick={() => sendWithPhotos(images, input)}
              disabled={busy}
              className="font-semibold text-cyan-300 hover:text-cyan-200 disabled:opacity-50"
            >
              Send to AI now →
            </button>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {images.map((src, idx) => (
              <div key={`preview-${idx}`} className="relative shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt={`Attach ${idx + 1}`}
                  className="h-20 w-20 rounded-xl object-cover"
                />
                <button
                  type="button"
                  onClick={() => removeImage(idx)}
                  className="absolute -right-1.5 -top-1.5 rounded-full bg-red-500 p-1"
                  aria-label={`Remove photo ${idx + 1}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            {images.length < MAX_PHOTO_DIAGNOSE_IMAGES && (
              <button
                type="button"
                onClick={openGallery}
                className="flex h-20 w-20 shrink-0 flex-col items-center justify-center rounded-xl border border-dashed border-slate-600 text-slate-400"
                aria-label="Add another photo"
              >
                <ImageIcon className="h-5 w-5" />
                <span className="mt-1 text-[10px]">Add</span>
              </button>
            )}
          </div>
        </div>
      )}

      {isFree && tokensExhausted && (
        <p className="mb-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-center text-xs text-amber-200">
          Monthly AI quota used up.
          {!hideStorePurchaseUi() && (
            <>
              {" "}
              <button
                type="button"
                className="font-semibold underline"
                onClick={() => showUpgrade("tokens")}
              >
                Upgrade
              </button>{" "}
              to keep chatting.
            </>
          )}
        </p>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex items-end gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => setToolsOpen((open) => !open)}
            disabled={busy}
            data-testid="chat-composer-more"
            aria-expanded={toolsOpen}
            aria-label={toolsOpen ? "Hide extra actions" : "More actions"}
            className={`flex min-h-[44px] min-w-[44px] items-center justify-center rounded-2xl p-2.5 transition-colors disabled:opacity-50 sm:min-h-[48px] sm:min-w-[48px] ${
              toolsOpen
                ? "bg-cyan-500/20 text-cyan-300"
                : "text-slate-400 hover:bg-slate-800"
            }`}
          >
            {toolsOpen ? (
              <X className="h-5 w-5 sm:h-6 sm:w-6" />
            ) : (
              <Plus className="h-5 w-5 sm:h-6 sm:w-6" />
            )}
          </button>

          <textarea
            ref={textareaRef}
            rows={1}
            data-testid="chat-input"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              const el = e.target;
              el.style.height = "auto";
              el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder={
              isListening
                ? "Listening… speak now (text appears for review)"
                : tokensExhausted && isFree
                  ? "Token quota used — try again next month…"
                  : images.length > 0
                    ? "Optional note about these photos…"
                    : "Ask about your car…"
            }
            className="chat-textarea max-h-40 min-h-[48px] min-w-0 flex-1 resize-none rounded-3xl border border-slate-700 bg-slate-900 px-3 py-3 text-base leading-snug focus:border-cyan-400 focus:outline-none disabled:opacity-60 sm:px-6 sm:py-3.5"
            disabled={busy || isListening}
          />

          {isGenerating && onStop ? (
            <button
              type="button"
              onClick={onStop}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 rounded-3xl bg-red-500/90 px-4 font-medium text-white transition hover:bg-red-500 sm:min-h-[48px] sm:px-6"
              title="Stop generating"
              aria-label="Stop generating"
            >
              <Square className="h-4 w-4 fill-current" />
            </button>
          ) : (
            <button
              type="button"
              data-testid="chat-send"
              onClick={handleSubmit}
              disabled={busy || (!input.trim() && images.length === 0)}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 rounded-3xl bg-cyan-500 px-4 font-medium text-black transition-all hover:bg-cyan-400 disabled:bg-slate-700 disabled:text-slate-400 sm:min-h-[48px] sm:px-8"
            >
              <Send className="h-5 w-5" />
            </button>
          )}
        </div>

        {(toolsOpen && (showMic || showTts)) && (
          <div className="flex items-center justify-center gap-2 sm:justify-start">
            {showMic && (
              <button
                type="button"
                onClick={toggleVoiceInput}
                disabled={busy}
                aria-label={isListening ? "Stop voice input" : "Start voice input"}
                aria-pressed={isListening}
                title={
                  features.canUseVoice
                    ? "Voice → draft in the box (review, then send)"
                    : "Voice requires Pro"
                }
                className={`flex min-h-[44px] min-w-[44px] items-center justify-center rounded-2xl px-3 transition-colors ${
                  isListening
                    ? "bg-red-500/20 text-red-400 ring-2 ring-red-400/50"
                    : features.canUseVoice
                      ? "text-slate-400 hover:bg-slate-800"
                      : "text-slate-600 hover:bg-slate-800/60"
                } disabled:opacity-50`}
              >
                {isListening ? (
                  <MicOff className="h-5 w-5 animate-pulse" />
                ) : (
                  <Mic className="h-5 w-5" />
                )}
                <span className="ml-1.5 text-xs sm:hidden">
                  {isListening ? "Stop" : "Voice"}
                </span>
              </button>
            )}

            {showTts && (
              <button
                type="button"
                onClick={toggleAutoSpeak}
                aria-label={autoSpeak ? "Turn off auto-read" : "Turn on auto-read"}
                aria-pressed={autoSpeak && features.voiceEnabled}
                title={
                  features.voiceEnabled
                    ? "Auto-read AI replies (hands-free coaching)"
                    : "Auto-read requires Pro"
                }
                className={`flex min-h-[44px] min-w-[44px] items-center justify-center rounded-2xl px-3 transition-colors ${
                  autoSpeak && features.voiceEnabled
                    ? "bg-cyan-500/15 text-cyan-300"
                    : "text-slate-500 hover:bg-slate-800"
                }`}
              >
                {autoSpeak && features.voiceEnabled ? (
                  <Volume2 className="h-5 w-5" />
                ) : (
                  <VolumeX className="h-5 w-5" />
                )}
                <span className="sr-only">Read aloud</span>
              </button>
            )}
          </div>
        )}
      </div>

      <div className="mt-2 space-y-1 text-center">
        {onOpenSafetyNotes ? (
          <button
            type="button"
            data-testid="chat-safety-notes-link"
            onClick={onOpenSafetyNotes}
            className="min-h-[44px] text-[11px] font-medium text-slate-400 underline-offset-2 hover:text-cyan-300 hover:underline"
          >
            Safety notes
          </button>
        ) : null}
        {photoRemainingLabel ? (
          <p className="text-[11px] leading-relaxed text-slate-500">
            {photoRemainingLabel}
          </p>
        ) : null}
      </div>
      {voiceError && (
        <p className="mt-1 text-center text-xs text-amber-400">{voiceError}</p>
      )}
    </div>
  );
}
