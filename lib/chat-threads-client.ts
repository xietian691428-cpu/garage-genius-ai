/**
 * Browser helpers for /api/chat/threads — New topic + topic list.
 */

import type { ChatMessage } from "@/lib/types/chat";

export type ChatThreadSummary = {
  id: string;
  vehicleId: string;
  title: string | null;
  displayTitle: string;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
};

async function authHeader(accessToken: string): Promise<HeadersInit> {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
}

export async function fetchVehicleThreads(
  accessToken: string,
  vehicleId: string,
): Promise<ChatThreadSummary[]> {
  const res = await fetch(
    `/api/chat/threads?vehicleId=${encodeURIComponent(vehicleId)}`,
    { headers: await authHeader(accessToken) },
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `List topics failed (${res.status})`);
  }
  const data = (await res.json()) as { threads?: ChatThreadSummary[] };
  return Array.isArray(data.threads) ? data.threads : [];
}

export async function createVehicleThread(
  accessToken: string,
  vehicleId: string,
): Promise<{ threadId: string }> {
  const res = await fetch("/api/chat/threads", {
    method: "POST",
    headers: await authHeader(accessToken),
    body: JSON.stringify({ vehicleId }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `New topic failed (${res.status})`);
  }
  const data = (await res.json()) as { threadId?: string };
  if (!data.threadId) throw new Error("New topic returned no threadId");
  return { threadId: data.threadId };
}

export async function fetchThreadMessages(
  accessToken: string,
  threadId: string,
): Promise<{
  threadId: string;
  vehicleId: string;
  title: string | null;
  messages: ChatMessage[];
}> {
  const res = await fetch(
    `/api/chat/threads/${encodeURIComponent(threadId)}/messages`,
    { headers: await authHeader(accessToken) },
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `Load topic failed (${res.status})`);
  }
  const data = (await res.json()) as {
    threadId: string;
    vehicleId: string;
    title: string | null;
    messages: Array<{
      id: string;
      role: "user" | "assistant";
      content: string;
      image?: string | null;
      createdAt: string;
    }>;
  };
  const messages: ChatMessage[] = (data.messages || []).map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    image: m.image ?? undefined,
    images: m.image ? [m.image] : undefined,
    timestamp: new Date(m.createdAt),
  }));
  return {
    threadId: data.threadId,
    vehicleId: data.vehicleId,
    title: data.title,
    messages,
  };
}
