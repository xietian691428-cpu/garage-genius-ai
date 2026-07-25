import type { ChatMessage } from "@/lib/types/chat";
import { messageImages } from "@/lib/types/chat";

const CHAT_KEY_PREFIX = "garageGenius_chat_";
const CURRENT_VEHICLE_ID_KEY = "garageGenius_currentVehicleId";
const MAX_STORED_MESSAGES = 100;

interface StoredChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  image?: string;
  timestamp: string;
}

function chatKey(vehicleId: string) {
  return `${CHAT_KEY_PREFIX}${vehicleId}`;
}

function serialize(message: ChatMessage): StoredChatMessage {
  const imgs = messageImages(message);
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    image: imgs[0] ?? message.image,
    timestamp:
      message.timestamp instanceof Date
        ? message.timestamp.toISOString()
        : String(message.timestamp),
  };
}

function deserialize(stored: StoredChatMessage): ChatMessage {
  return {
    id: stored.id,
    role: stored.role,
    content: stored.content,
    image: stored.image,
    images: stored.image ? [stored.image] : undefined,
    timestamp: new Date(stored.timestamp),
  };
}

export function loadCurrentVehicleId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(CURRENT_VEHICLE_ID_KEY);
}

export function saveCurrentVehicleId(vehicleId: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(CURRENT_VEHICLE_ID_KEY, vehicleId);
}

export function loadChatMessages(vehicleId: string): ChatMessage[] | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = localStorage.getItem(chatKey(vehicleId));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as StoredChatMessage[];
    if (!Array.isArray(parsed) || parsed.length === 0) return null;

    return parsed.map(deserialize);
  } catch {
    return null;
  }
}

/** Vehicle ids that still have a local chat blob (for one-time cloud migrate). */
export function listLocalChatVehicleIds(): string[] {
  if (typeof window === "undefined") return [];
  const ids: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(CHAT_KEY_PREFIX)) continue;
    ids.push(key.slice(CHAT_KEY_PREFIX.length));
  }
  return ids;
}

function writeMessages(vehicleId: string, stored: StoredChatMessage[]): void {
  localStorage.setItem(chatKey(vehicleId), JSON.stringify(stored));
}

export function saveChatMessages(
  vehicleId: string,
  messages: ChatMessage[],
): void {
  if (typeof window === "undefined" || messages.length === 0) return;

  const base = messages.slice(-MAX_STORED_MESSAGES).map(serialize);

  try {
    writeMessages(vehicleId, base);
    return;
  } catch {
    // Quota exceeded — drop images on older messages first
  }

  const withoutOldImages = base.map((msg, index) =>
    index < base.length - 3 ? { ...msg, image: undefined } : msg,
  );

  try {
    writeMessages(vehicleId, withoutOldImages);
    return;
  } catch {
    // Last resort: text-only history
  }

  try {
    writeMessages(
      vehicleId,
      base.map(({ id, role, content, timestamp }) => ({
        id,
        role,
        content,
        timestamp,
      })),
    );
  } catch {
    // Storage full or unavailable — keep in-memory session only
  }
}
