/**
 * Cloud chat transcripts — Supabase chat_messages + one-time localStorage migrate.
 */

import { supabase } from "@/lib/supabase";
import type { ChatMessage } from "@/lib/types/chat";
import { messageImages } from "@/lib/types/chat";
import {
  chatHistoryLimit,
  FREE_CHAT_MESSAGE_LIMIT,
  PRO_CHAT_MESSAGE_LIMIT,
} from "@/lib/history-limits";
import {
  loadChatMessages as loadLocalChatMessages,
  saveChatMessages as mirrorLocalChatMessages,
  listLocalChatVehicleIds,
} from "@/lib/chat-storage";

const MIGRATED_KEY_PREFIX = "garageGenius_chat_migrated_";
const MAX_IMAGE_CHARS = 120_000;

type ChatMessageRow = {
  id: string;
  user_id: string;
  vehicle_id: string;
  client_message_id: string;
  role: "user" | "assistant";
  content: string;
  image: string | null;
  created_at: string;
};

function isUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    id,
  );
}

function migratedKey(userId: string) {
  return `${MIGRATED_KEY_PREFIX}${userId}`;
}

function rowToMessage(row: ChatMessageRow): ChatMessage {
  const image = row.image ?? undefined;
  return {
    id: row.client_message_id,
    role: row.role,
    content: row.content,
    image,
    images: image ? [image] : undefined,
    timestamp: new Date(row.created_at),
  };
}

function trimForPlan(messages: ChatMessage[], isPro: boolean): ChatMessage[] {
  const limit = chatHistoryLimit(isPro);
  return messages.slice(-limit);
}

function sanitizeImage(image?: string): string | null {
  if (!image) return null;
  if (image.length > MAX_IMAGE_CHARS) return null;
  return image;
}

export const chatCloudService = {
  async load(
    vehicleId: string,
    options?: { isPro?: boolean },
  ): Promise<ChatMessage[] | null> {
    if (!isUuid(vehicleId)) return null;

    const isPro = options?.isPro ?? false;
    const limit = chatHistoryLimit(isPro);

    const { data, error } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("vehicle_id", vehicleId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;
    if (!data || data.length === 0) return null;

    const chronological = (data as ChatMessageRow[])
      .slice()
      .reverse()
      .map(rowToMessage);

    mirrorLocalChatMessages(vehicleId, chronological);
    return chronological;
  },

  /**
   * Upsert the trailing window of messages; drop rows beyond the plan cap.
   */
  async save(
    vehicleId: string,
    messages: ChatMessage[],
    options?: { isPro?: boolean },
  ): Promise<void> {
    if (!isUuid(vehicleId) || messages.length === 0) return;

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) return;

    const isPro = options?.isPro ?? false;
    const trimmed = trimForPlan(messages, isPro).filter(
      (m) => m.id !== "welcome" || messages.length === 1,
    );
    // Persist real turns; keep a lone welcome only if that's all we have
    const toStore = trimmed.filter((m) => m.id !== "welcome");
    if (toStore.length === 0) {
      mirrorLocalChatMessages(vehicleId, messages);
      return;
    }

    const rows = toStore.map((m) => {
      const imgs = messageImages(m);
      return {
        user_id: user.id,
        vehicle_id: vehicleId,
        client_message_id: m.id,
        role: m.role,
        content: m.content,
        // Cloud column is single text — persist first photo only
        image: sanitizeImage(imgs[0] ?? m.image),
        created_at:
          m.timestamp instanceof Date
            ? m.timestamp.toISOString()
            : new Date(m.timestamp).toISOString(),
      };
    });

    const { error: upsertError } = await supabase
      .from("chat_messages")
      .upsert(rows, { onConflict: "user_id,vehicle_id,client_message_id" });

    if (upsertError) throw upsertError;

    // Trim server-side leftovers beyond plan limit
    const keepIds = toStore.map((m) => m.id);
    const hardCap = isPro ? PRO_CHAT_MESSAGE_LIMIT : FREE_CHAT_MESSAGE_LIMIT;

    const { data: existing } = await supabase
      .from("chat_messages")
      .select("id, client_message_id, created_at")
      .eq("vehicle_id", vehicleId)
      .order("created_at", { ascending: false });

    if (existing && existing.length > hardCap) {
      const overflow = existing.slice(hardCap) as {
        id: string;
        client_message_id: string;
      }[];
      const dropIds = overflow
        .filter((r) => !keepIds.includes(r.client_message_id))
        .map((r) => r.id);
      // Also drop anything not in the current window when over cap
      const overCapIds = existing.slice(hardCap).map((r) => r.id as string);
      const ids = [...new Set([...dropIds, ...overCapIds])];
      if (ids.length > 0) {
        await supabase.from("chat_messages").delete().in("id", ids);
      }
    }

    mirrorLocalChatMessages(vehicleId, toStore);
  },

  async migrateLocalIfNeeded(
    userId: string,
    vehicleIds: string[],
  ): Promise<void> {
    if (typeof window === "undefined") return;
    if (localStorage.getItem(migratedKey(userId)) === "1") return;

    const uuidVehicles = new Set(vehicleIds.filter(isUuid));
    const localKeys = listLocalChatVehicleIds();

    for (const vehicleId of localKeys) {
      if (!uuidVehicles.has(vehicleId)) continue;
      const local = loadLocalChatMessages(vehicleId);
      if (!local || local.length === 0) continue;

      const { count } = await supabase
        .from("chat_messages")
        .select("id", { count: "exact", head: true })
        .eq("vehicle_id", vehicleId);

      if ((count ?? 0) > 0) continue;

      try {
        await chatCloudService.save(vehicleId, local, { isPro: true });
      } catch (err) {
        console.warn("[chat-cloud] migrate failed for", vehicleId, err);
      }
    }

    localStorage.setItem(migratedKey(userId), "1");
  },
};
