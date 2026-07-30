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

/** Show Connect OBD entry when owned OR preference not yet set. */
export function shouldShowObdConnectEntry(pref: ObdAdapterPreference): boolean {
  return pref.hasObdAdapter || pref.preferenceUnset;
}

/** Emphasize device list / Connect steps only when explicitly owned. */
export function shouldEmphasizeObdConnect(pref: ObdAdapterPreference): boolean {
  return pref.hasObdAdapter && !pref.preferenceUnset;
}

/**
 * Inject into chat system prompt. Prefer fault-code / screenshot language
 * when the user does not have an adapter.
 */
export function formatObdPreferencePromptBlock(
  pref?: ObdAdapterPreference | null,
): string {
  const has = pref?.hasObdAdapter === true && pref.source === "self";
  if (has) {
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
- Do NOT push "connect your OBD", "plug in your adapter", or live Bluetooth pairing.
- When codes would help: suggest Enter fault code (e.g. from a parts-store scan) or upload an OBD screenshot — optional, not required.
- Prefer visual checks, symptoms, and safe DIY steps without assuming they have a scanner at home.
`.trim();
}
