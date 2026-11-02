/**
 * Server-authoritative Chat history.
 * Model-bound messages are loaded from chat_threads / chat_messages by
 * user_id + vehicle_id + thread_id — never from a client-submitted transcript.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { DeepSeekMessage } from "@/lib/deepseek";
import {
  FREE_CHAT_MESSAGE_LIMIT,
  PRO_CHAT_MESSAGE_LIMIT,
} from "@/lib/history-limits";

export const THREAD_FORBIDDEN_CODE = "THREAD_FORBIDDEN";
export const THREAD_VEHICLE_MISMATCH_CODE = "THREAD_VEHICLE_MISMATCH";
export const THREAD_NOT_FOUND_CODE = "THREAD_NOT_FOUND";

export type ChatThreadRow = {
  id: string;
  user_id: string;
  vehicle_id: string;
  title?: string | null;
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
  closed_at: string | null;
};

export type ChatMessageAuthorityRow = {
  id: string;
  thread_id: string | null;
  user_id: string;
  vehicle_id: string;
  client_message_id: string;
  role: "user" | "assistant";
  content: string;
  image: string | null;
  created_at: string;
};

export type ThreadAuthorityError = Error & {
  code: string;
  status: number;
};

function isUuid(id: string | null | undefined): id is string {
  return Boolean(
    id &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        id,
      ),
  );
}

function authorityError(
  message: string,
  code: string,
  status: number,
): ThreadAuthorityError {
  return Object.assign(new Error(message), { code, status });
}

/** Current user turn only — never take content from client messages[]. */
export function extractCurrentUserMessage(message: unknown): string {
  if (typeof message === "string" && message.trim()) return message.trim();
  return "";
}

/**
 * Transitional debug helper: detect whether a discarded messages[] blob
 * differs from the authoritative current turn (never used for the model).
 */
export function clientTranscriptLooksTampered(opts: {
  message: string;
  messages?: Array<{ role?: string; content?: unknown }> | null;
}): boolean {
  if (!Array.isArray(opts.messages) || opts.messages.length === 0) return false;
  if (opts.messages.length > 1) return true;
  const only = opts.messages[0];
  if (only?.role !== "user") return true;
  const text =
    typeof only.content === "string"
      ? only.content.trim()
      : Array.isArray(only.content)
        ? only.content
            .map((part) => {
              if (!part || typeof part !== "object") return "";
              const p = part as { type?: string; text?: string };
              return p.type === "text" && typeof p.text === "string"
                ? p.text
                : "";
            })
            .filter(Boolean)
            .join("\n")
            .trim()
        : "";
  return Boolean(text) && text !== opts.message.trim();
}

/** Close every open thread for this user+vehicle (vehicle switch / hard reset). */
export async function closeOpenThreadsForVehicle(
  client: SupabaseClient,
  userId: string,
  vehicleId: string,
): Promise<void> {
  const now = new Date().toISOString();
  await client
    .from("chat_threads")
    .update({ closed_at: now, updated_at: now })
    .eq("user_id", userId)
    .eq("vehicle_id", vehicleId)
    .is("closed_at", null);
}

export async function createChatThread(
  client: SupabaseClient,
  userId: string,
  vehicleId: string,
): Promise<ChatThreadRow> {
  const { data, error } = await client
    .from("chat_threads")
    .insert({
      user_id: userId,
      vehicle_id: vehicleId,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as ChatThreadRow;
}

/**
 * Resolve the thread for this turn.
 * - threadId present: must match auth user + request vehicle (else 403).
 * - forceNew (New topic): create a sibling open thread — does NOT close others.
 * - else: get-or-create default open thread for user+vehicle (latest updated_at).
 * Vehicle switch should omit threadId (client) and use default — never pass another car's id.
 */
export async function resolveChatThread(opts: {
  client: SupabaseClient;
  userId: string;
  vehicleId: string;
  threadId?: string | null;
  forceNew?: boolean;
}): Promise<{ thread: ChatThreadRow; created: boolean }> {
  const { client, userId, vehicleId, forceNew } = opts;

  if (forceNew) {
    // Explicit new topic on this vehicle — keep prior threads for list/switch-back.
    const thread = await createChatThread(client, userId, vehicleId);
    return { thread, created: true };
  }

  if (isUuid(opts.threadId)) {
    const { data, error } = await client
      .from("chat_threads")
      .select("*")
      .eq("id", opts.threadId)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      // Do not reveal whether the id exists for another user.
      throw authorityError(
        "Chat thread is not available for this account.",
        THREAD_FORBIDDEN_CODE,
        403,
      );
    }
    const row = data as ChatThreadRow;
    // Unified ownership: wrong user / wrong vehicle / forged id → 403.
    assertThreadMatchesRequest({
      thread: row,
      userId,
      vehicleId,
    });
    if (row.closed_at) {
      const thread = await createChatThread(client, userId, vehicleId);
      return { thread, created: true };
    }
    return { thread: row, created: false };
  }

  return getOrCreateDefaultThread(client, userId, vehicleId);
}

export type ChatThreadListItem = {
  id: string;
  vehicleId: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
};

export function formatThreadTitle(
  title: string | null | undefined,
  fallbackDate?: string | null,
): string {
  const t = title?.trim();
  if (t) return t.length > 40 ? `${t.slice(0, 40)}…` : t;
  if (fallbackDate) {
    try {
      const d = new Date(fallbackDate);
      return `Topic · ${d.toLocaleDateString()}`;
    } catch {
      /* ignore */
    }
  }
  return "New topic";
}

export function titleFromFirstUserMessage(content: string): string {
  const one = content.replace(/\s+/g, " ").trim();
  if (!one) return "New topic";
  return one.length > 40 ? `${one.slice(0, 40)}…` : one;
}

/** List open threads for one vehicle (newest first). */
export async function listVehicleThreads(opts: {
  client: SupabaseClient;
  userId: string;
  vehicleId: string;
  limit?: number;
}): Promise<ChatThreadListItem[]> {
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 50);
  const { data, error } = await opts.client
    .from("chat_threads")
    .select("id, vehicle_id, title, created_at, updated_at, last_message_at")
    .eq("user_id", opts.userId)
    .eq("vehicle_id", opts.vehicleId)
    .is("closed_at", null)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []).map((row) => ({
    id: row.id as string,
    vehicleId: row.vehicle_id as string,
    title: (row.title as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    lastMessageAt: (row.last_message_at as string | null) ?? null,
  }));
}

export type ClientThreadMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  image?: string | null;
  createdAt: string;
};

/** Paginated messages for UI — always scoped by user_id + thread_id. */
export async function loadThreadMessagesForClient(opts: {
  client: SupabaseClient;
  userId: string;
  threadId: string;
  limit?: number;
  before?: string | null;
}): Promise<{ thread: ChatThreadRow; messages: ClientThreadMessage[] }> {
  const { data: thread, error: tErr } = await opts.client
    .from("chat_threads")
    .select("*")
    .eq("id", opts.threadId)
    .maybeSingle();
  if (tErr) throw tErr;
  if (!thread) {
    throw authorityError(
      "Chat thread is not available for this account.",
      THREAD_FORBIDDEN_CODE,
      403,
    );
  }
  const row = thread as ChatThreadRow;
  // Same rule as /api/chat: other user's thread (or missing) → 403, not 404.
  if (row.user_id !== opts.userId) {
    throw authorityError(
      "Chat thread is not available for this account.",
      THREAD_FORBIDDEN_CODE,
      403,
    );
  }

  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 200);
  let q = opts.client
    .from("chat_messages")
    .select("client_message_id, role, content, image, created_at")
    .eq("thread_id", opts.threadId)
    .eq("user_id", opts.userId)
    .eq("vehicle_id", row.vehicle_id)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (opts.before?.trim()) {
    q = q.lt("created_at", opts.before.trim());
  }
  const { data, error } = await q;
  if (error) throw error;
  const messages = ((data || []) as Array<{
    client_message_id: string;
    role: "user" | "assistant";
    content: string;
    image: string | null;
    created_at: string;
  }>)
    .slice()
    .reverse()
    .map((m) => ({
      id: m.client_message_id,
      role: m.role,
      content: m.content,
      image: m.image,
      createdAt: m.created_at,
    }));
  return { thread: row, messages };
}

export async function maybeSetThreadTitleFromUserMessage(opts: {
  client: SupabaseClient;
  userId: string;
  threadId: string;
  userContent: string;
}): Promise<void> {
  const title = titleFromFirstUserMessage(opts.userContent);
  const { data } = await opts.client
    .from("chat_threads")
    .select("title")
    .eq("id", opts.threadId)
    .eq("user_id", opts.userId)
    .maybeSingle();
  if (data?.title) return;
  await opts.client
    .from("chat_threads")
    .update({ title })
    .eq("id", opts.threadId)
    .eq("user_id", opts.userId)
    .is("title", null);
}

export async function getOrCreateDefaultThread(
  client: SupabaseClient,
  userId: string,
  vehicleId: string,
): Promise<{ thread: ChatThreadRow; created: boolean }> {
  const { data: open, error: openErr } = await client
    .from("chat_threads")
    .select("*")
    .eq("user_id", userId)
    .eq("vehicle_id", vehicleId)
    .is("closed_at", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (openErr) throw openErr;
  if (open) return { thread: open as ChatThreadRow, created: false };

  const thread = await createChatThread(client, userId, vehicleId);
  return { thread, created: true };
}

/** Prior + current turns for the model — always scoped by user_id + thread_id + vehicle_id. */
export async function loadAuthoritativeThreadMessages(opts: {
  client: SupabaseClient;
  userId: string;
  threadId: string;
  vehicleId: string;
  limit?: number;
}): Promise<DeepSeekMessage[]> {
  const limit = Math.max(
    1,
    Math.min(opts.limit ?? PRO_CHAT_MESSAGE_LIMIT, PRO_CHAT_MESSAGE_LIMIT),
  );
  const { data, error } = await opts.client
    .from("chat_messages")
    .select("role, content, created_at, vehicle_id, user_id, thread_id")
    .eq("thread_id", opts.threadId)
    .eq("user_id", opts.userId)
    .eq("vehicle_id", opts.vehicleId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  const rows = ((data || []) as ChatMessageAuthorityRow[]).slice().reverse();
  return rows
    .filter((r) => r.role === "user" || r.role === "assistant")
    .filter((r) => typeof r.content === "string" && r.content.trim())
    .map((r) => ({ role: r.role, content: r.content.trim() }));
}

export async function persistUserMessage(opts: {
  client: SupabaseClient;
  userId: string;
  vehicleId: string;
  threadId: string;
  content: string;
  clientMessageId?: string | null;
  image?: string | null;
}): Promise<string> {
  const clientMessageId =
    (isUuid(opts.clientMessageId) && opts.clientMessageId) ||
    crypto.randomUUID();
  const now = new Date().toISOString();
  const { error } = await opts.client.from("chat_messages").upsert(
    {
      user_id: opts.userId,
      vehicle_id: opts.vehicleId,
      thread_id: opts.threadId,
      client_message_id: clientMessageId,
      role: "user",
      content: opts.content,
      image: opts.image ?? null,
      created_at: now,
    },
    { onConflict: "user_id,vehicle_id,client_message_id" },
  );
  if (error) throw error;
  await opts.client
    .from("chat_threads")
    .update({ last_message_at: now, updated_at: now })
    .eq("id", opts.threadId)
    .eq("user_id", opts.userId);
  try {
    await maybeSetThreadTitleFromUserMessage({
      client: opts.client,
      userId: opts.userId,
      threadId: opts.threadId,
      userContent: opts.content,
    });
  } catch {
    /* title is best-effort */
  }
  return clientMessageId;
}

export async function persistAssistantMessage(opts: {
  client: SupabaseClient;
  userId: string;
  vehicleId: string;
  threadId: string;
  content: string;
  clientMessageId?: string | null;
  provider?: string | null;
  model?: string | null;
}): Promise<string> {
  const clientMessageId =
    (isUuid(opts.clientMessageId) && opts.clientMessageId) ||
    crypto.randomUUID();
  const now = new Date().toISOString();
  const { error } = await opts.client.from("chat_messages").upsert(
    {
      user_id: opts.userId,
      vehicle_id: opts.vehicleId,
      thread_id: opts.threadId,
      client_message_id: clientMessageId,
      role: "assistant",
      content: opts.content,
      image: null,
      created_at: now,
    },
    { onConflict: "user_id,vehicle_id,client_message_id" },
  );
  if (error) throw error;
  await opts.client
    .from("chat_threads")
    .update({ last_message_at: now, updated_at: now })
    .eq("id", opts.threadId)
    .eq("user_id", opts.userId);
  return clientMessageId;
}

/**
 * Cap DB-loaded history for the model window.
 * After user persist, `history` already includes the current user turn.
 */
export function capAuthoritativeHistory(
  history: DeepSeekMessage[],
  opts?: { isPro?: boolean },
): DeepSeekMessage[] {
  const cap = opts?.isPro ? PRO_CHAT_MESSAGE_LIMIT : FREE_CHAT_MESSAGE_LIMIT;
  return history.slice(-cap);
}

/**
 * Build model user/assistant window when current turn is not yet in `prior`
 * (unit-test helper / pre-persist assembly). forceNew → current user only.
 */
export function assembleModelUserMessages(opts: {
  prior: DeepSeekMessage[];
  currentUserContent: string;
  forceNewThread?: boolean;
  isPro?: boolean;
}): DeepSeekMessage[] {
  const cap = opts.isPro ? PRO_CHAT_MESSAGE_LIMIT : FREE_CHAT_MESSAGE_LIMIT;
  const prior =
    opts.forceNewThread || !opts.prior.length
      ? []
      : opts.prior.slice(-Math.max(0, cap - 1));
  return [...prior, { role: "user", content: opts.currentUserContent }];
}

/** True when client/isolation flags require a brand-new thread. */
export function shouldForceNewChatThread(input: {
  vehicleThreadReset?: boolean;
  vehicleChanged?: boolean;
  previousVehicleId?: string | null;
  currentVehicleId?: string | null;
}): boolean {
  if (input.vehicleThreadReset === true || input.vehicleChanged === true) {
    return true;
  }
  const prev = input.previousVehicleId?.trim() || "";
  const cur = input.currentVehicleId?.trim() || "";
  return Boolean(prev && cur && prev !== cur);
}

/** Pure checks for Vitest (no DB). */
export function assertThreadMatchesRequest(opts: {
  thread: Pick<ChatThreadRow, "user_id" | "vehicle_id">;
  userId: string;
  vehicleId: string;
}): void {
  if (opts.thread.user_id !== opts.userId) {
    throw authorityError(
      "Chat thread is not available for this account.",
      THREAD_FORBIDDEN_CODE,
      403,
    );
  }
  if (opts.thread.vehicle_id !== opts.vehicleId) {
    throw authorityError(
      "Chat thread belongs to a different vehicle. Switch vehicles and use that car's thread.",
      THREAD_VEHICLE_MISMATCH_CODE,
      403,
    );
  }
}
