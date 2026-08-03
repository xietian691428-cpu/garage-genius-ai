import { extractDtcCodes, lookupDtc } from "@/lib/dtc";
import type { VehicleInfo } from "@/lib/types/chat";
import type {
  ShopReportChatMessage,
  ShopReportDtc,
  ShopReportPreview,
} from "@/lib/types/shop-report";
import { formatVehicleYmmMarket } from "@/lib/types/vehicle-market";

export function createShopReportId(): string {
  const hex = Math.random().toString(16).slice(2, 6).toUpperCase();
  return `GG-${hex}`;
}

export function vinLast8(vin?: string | null): string | null {
  const v = vin?.trim().toUpperCase();
  if (!v || v.length < 8) return null;
  return v.slice(-8);
}

export function collectCodesFromMessages(
  messages: ShopReportChatMessage[],
): ShopReportDtc[] {
  const seen = new Set<string>();
  const out: ShopReportDtc[] = [];
  for (const m of messages) {
    for (const code of extractDtcCodes(m.content || "")) {
      if (seen.has(code)) continue;
      seen.add(code);
      const d = lookupDtc(code);
      out.push({
        code: d.code,
        definition: d.desc,
        severity: d.severity,
      });
    }
  }
  return out;
}

export function userTextBlob(messages: ShopReportChatMessage[]): string {
  return messages
    .filter((m) => m.role === "user")
    .map((m) => m.content.trim())
    .filter(Boolean)
    .join("\n\n");
}

export function buildShopReportPreview(input: {
  vehicle: VehicleInfo;
  messages?: ShopReportChatMessage[];
  coachText?: string;
}): ShopReportPreview {
  const messages = input.messages ?? [];
  const codes = collectCodesFromMessages(messages).map((c) => c.code);
  const userBlob = userTextBlob(messages);
  const coach = (input.coachText || "").trim();
  const symptomPreview = (userBlob || coach).replace(/\s+/g, " ").slice(0, 160);
  const hasEnoughData =
    codes.length > 0 ||
    userBlob.length >= 24 ||
    coach.length >= 40;

  return {
    ymm: formatVehicleYmmMarket(input.vehicle),
    mileageLabel:
      input.vehicle.mileage != null && input.vehicle.mileage > 0
        ? `${input.vehicle.mileage.toLocaleString()} mi`
        : "Mileage not on file",
    symptomPreview: symptomPreview || "No symptom text yet",
    codes,
    hasEnoughData,
    reasonIfEmpty: hasEnoughData
      ? undefined
      : "Please complete a diagnosis first — add symptoms in Chat, enter a fault code, or finish a Coach guide.",
  };
}

/** Compact transcript for the LLM (cap length). */
export function truncateTranscript(
  messages: ShopReportChatMessage[],
  maxChars = 10_000,
): string {
  const parts: string[] = [];
  let used = 0;
  for (const m of messages.slice(-40)) {
    const block = `${m.role.toUpperCase()}: ${m.content.trim()}`;
    if (!block.trim()) continue;
    if (used + block.length > maxChars) break;
    parts.push(block);
    used += block.length;
  }
  return parts.join("\n\n");
}
