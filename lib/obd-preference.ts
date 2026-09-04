/**
 * Optional OBD adapter ownership preference (profiles.has_obd_adapter).
 * Education / UX only — does not gate Enter fault code or OBD screenshot.
 */

export type ObdAdapterSource = "default" | "self";

export type ObdAdapterPreference = {
  hasObdAdapter: boolean;
  /** true when user has not explicitly chosen yet (source === default) */
  preferenceUnset: boolean;
  source: ObdAdapterSource;
  updatedAt?: string | null;
};

export function normalizeObdAdapterSource(
  value?: string | null,
): ObdAdapterSource {
  return value === "self" ? "self" : "default";
}

export function parseObdAdapterPreference(row?: {
  has_obd_adapter?: boolean | null;
  has_obd_adapter_source?: string | null;
  has_obd_adapter_updated_at?: string | null;
} | null): ObdAdapterPreference {
  const source = normalizeObdAdapterSource(row?.has_obd_adapter_source);
  const hasObdAdapter = Boolean(row?.has_obd_adapter);
  return {
    hasObdAdapter,
    preferenceUnset: source === "default",
    source,
    updatedAt: row?.has_obd_adapter_updated_at ?? null,
  };
}

/**
 * Show Connect OBD / BLE entry only when the user explicitly enabled
 * “I have an OBD-II adapter”. Default / unset = hidden (still Enter code + screenshot).
 */
export function shouldShowObdConnectEntry(pref: ObdAdapterPreference): boolean {
  return pref.hasObdAdapter === true;
}

/** Emphasize device list / Connect steps only when explicitly owned. */
export function shouldEmphasizeObdConnect(pref: ObdAdapterPreference): boolean {
  return pref.hasObdAdapter === true && !pref.preferenceUnset;
}

/** Guard before any Web Bluetooth connect attempt. */
export function canStartObdBleConnect(pref: ObdAdapterPreference): boolean {
  return pref.hasObdAdapter === true;
}

/**
 * Dashboard “Refresh Sensors” when there is no live session:
 * adapter ON → same BLE modal as Chat Connect; OFF → Settings, never the connect sheet.
 */
export type ObdRefreshSensorsAction = "read" | "open_connect" | "open_settings";

export function refreshSensorsAction(input: {
  hasObdAdapter: boolean;
  isConnected: boolean;
}): ObdRefreshSensorsAction {
  if (input.isConnected) return "read";
  if (input.hasObdAdapter) return "open_connect";
  return "open_settings";
}

/** True only when the owner explicitly said they have an adapter. */
export function hasLiveObdAdapter(
  pref?: ObdAdapterPreference | null,
): boolean {
  return pref?.hasObdAdapter === true && pref.source === "self";
}

/**
 * Model-output phrases that pretend a Bluetooth/live adapter feed exists.
 * Prompt instructions that say "do not claim live OBD" are not a match.
 */
export function obdReplyClaimsLiveData(text: string): boolean {
  return (
    /\bbased on live obd\b/i.test(text) ||
    /\blive obd readings\b/i.test(text) ||
    /\breal[- ]?time obd\b/i.test(text) ||
    /\brealtime obd (data|readings|sensors)\b/i.test(text)
  );
}

/**
 * Soft-rewrite fake live/realtime OBD claims when no adapter is on file.
 */
export function applyObdHonestyGuards(
  text: string,
  hasLiveAdapter: boolean,
): string {
  if (hasLiveAdapter || !text?.trim()) return text;
  return text
    .replace(/\bbased on live OBD readings\b/gi, "based on the codes you provided")
    .replace(/\blive OBD readings\b/gi, "user-provided OBD codes")
    .replace(/\blive OBD data\b/gi, "user-provided OBD codes")
    .replace(/\breal[- ]?time OBD(?: data| readings| sensors)?\b/gi, "user-provided OBD codes")
    .replace(/\brealtime OBD(?: data| readings| sensors)?\b/gi, "user-provided OBD codes");
}

/**
 * Inject into chat system prompt. Prefer fault-code / screenshot language
 * when the user does not have an adapter.
 */
export function formatObdPreferencePromptBlock(
  pref?: ObdAdapterPreference | null,
): string {
  if (hasLiveObdAdapter(pref)) {
    return `
## OBD adapter preference
- User indicated they have an OBD-II scanner / Bluetooth adapter.
- You may mention reading codes with their scanner when relevant.
- On iOS / App Store WebView, live Bluetooth OBD is often unavailable — prefer Enter fault code or an OBD screenshot rather than insisting on live BLE connect.
- Never claim a guaranteed diagnosis from a code alone.
`.trim();
  }

  return `
## OBD adapter preference
- User has not indicated they own an OBD-II / Bluetooth adapter (or chose "no").
- This session has no Bluetooth adapter feed. Do not claim "live OBD data", "realtime OBD", or "based on live OBD readings".
- Do NOT push "connect your OBD", "plug in your adapter", or live Bluetooth pairing.
- Codes the owner types, pastes, or uploads from a screenshot are user-provided — say so. You may still interpret them.
- When codes would help: suggest Enter fault code (e.g. from a parts-store scan) or upload an OBD screenshot — optional, not required.
- Prefer visual checks, symptoms, and safe DIY steps. Never invent PIDs, freeze-frame, or live RPM/coolant from an adapter that is not connected.
`.trim();
}
