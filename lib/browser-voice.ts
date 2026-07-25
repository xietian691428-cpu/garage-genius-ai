/**
 * Browser-native voice helpers (Web Speech STT is in ChatInput).
 * TTS uses speechSynthesis — $0 cost for Launch (PROJECT.md voice strategy).
 */

const AUTO_SPEAK_KEY = "garageGenius_autoSpeak";

/** Strip markdown / machine blocks so TTS sounds natural. */
export function textForSpeech(raw: string): string {
  return raw
    .replace(/<parts-data>[\s\S]*?<\/parts-data>/gi, "")
    .replace(/<focus-data>[\s\S]*?<\/focus-data>/gi, "")
    .replace(/<focus>[\s\S]*?<\/focus>/gi, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/!\[[^\]]*]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/[#>*_`~]/g, "")
    .replace(/\|\s*-+\s*\|/g, " ")
    .replace(/\|/g, ", ")
    .replace(/\n{2,}/g, ". ")
    .replace(/\n/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function isSpeechSynthesisSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function stopSpeaking(): void {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
}

export function speakText(
  raw: string,
  options?: { lang?: string; rate?: number; onEnd?: () => void },
): boolean {
  if (!isSpeechSynthesisSupported()) return false;

  const text = textForSpeech(raw);
  if (!text) return false;

  stopSpeaking();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = options?.lang ?? "en-US";
  utterance.rate = options?.rate ?? 1.02;
  utterance.pitch = 1;

  // Prefer a clear English voice when available
  const voices = window.speechSynthesis.getVoices();
  const preferred =
    voices.find(
      (v) =>
        v.lang.startsWith("en") &&
        /Google|Samantha|Daniel|Microsoft|Natural/i.test(v.name),
    ) || voices.find((v) => v.lang.startsWith("en"));
  if (preferred) utterance.voice = preferred;

  if (options?.onEnd) {
    utterance.onend = () => options.onEnd?.();
  }

  window.speechSynthesis.speak(utterance);
  return true;
}

export function loadAutoSpeakPreference(defaultValue = true): boolean {
  if (typeof window === "undefined") return defaultValue;
  try {
    const raw = localStorage.getItem(AUTO_SPEAK_KEY);
    if (raw === null) return defaultValue;
    return raw === "1";
  } catch {
    return defaultValue;
  }
}

export function saveAutoSpeakPreference(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(AUTO_SPEAK_KEY, enabled ? "1" : "0");
  } catch {
    // ignore
  }
}
