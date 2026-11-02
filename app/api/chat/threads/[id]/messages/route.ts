import { NextRequest, NextResponse } from "next/server";
import {
  assertEmailVerified,
  aiAbuseResponse,
  getBearerToken,
} from "@/lib/ai-abuse";
import { createSupabaseUserClient } from "@/lib/supabase-admin";
import {
  loadThreadMessagesForClient,
  THREAD_FORBIDDEN_CODE,
  THREAD_VEHICLE_MISMATCH_CODE,
} from "@/lib/chat-history-authority";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/chat/threads/:id/messages — thread-scoped history (own user only). */
export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const token = getBearerToken(req);
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userClient = createSupabaseUserClient(token);
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    try {
      assertEmailVerified(user);
    } catch (err) {
      const blocked = aiAbuseResponse(err);
      if (blocked) return blocked;
      throw err;
    }

    const { id: threadId } = await ctx.params;
    if (!threadId?.trim()) {
      return NextResponse.json({ error: "thread id required" }, { status: 400 });
    }

    const before = req.nextUrl.searchParams.get("before");
    const limitRaw = Number(req.nextUrl.searchParams.get("limit") || "100");
    const limit = Number.isFinite(limitRaw) ? limitRaw : 100;

    const { thread, messages } = await loadThreadMessagesForClient({
      client: userClient,
      userId: user.id,
      threadId: threadId.trim(),
      limit,
      before,
    });

    return NextResponse.json({
      threadId: thread.id,
      vehicleId: thread.vehicle_id,
      title: thread.title,
      messages,
    });
  } catch (err) {
    const blocked = aiAbuseResponse(err);
    if (blocked) return blocked;
    const status =
      err && typeof err === "object" && "status" in err
        ? Number((err as { status?: number }).status)
        : 0;
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code?: string }).code || "")
        : "";
    if (
      status === 403 ||
      code === THREAD_FORBIDDEN_CODE ||
      code === THREAD_VEHICLE_MISMATCH_CODE
    ) {
      return NextResponse.json(
        {
          error:
            err instanceof Error
              ? err.message
              : "Chat thread is not available.",
          code: code || THREAD_FORBIDDEN_CODE,
        },
        { status: 403 },
      );
    }
    console.error("[/api/chat/threads/:id/messages]", err);
    return NextResponse.json(
      { error: "Could not load topic messages." },
      { status: 500 },
    );
  }
}
