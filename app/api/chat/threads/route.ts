import { NextRequest, NextResponse } from "next/server";
import {
  assertEmailVerified,
  aiAbuseResponse,
  getBearerToken,
} from "@/lib/ai-abuse";
import { createSupabaseUserClient } from "@/lib/supabase-admin";
import {
  createChatThread,
  formatThreadTitle,
  listVehicleThreads,
} from "@/lib/chat-history-authority";
import {
  loadOwnedGarageVehicle,
  VEHICLE_NOT_OWNED_CODE,
} from "@/lib/chat-vehicle-ownership";

export const runtime = "nodejs";

async function requireUser(req: NextRequest) {
  const token = getBearerToken(req);
  if (!token) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const userClient = createSupabaseUserClient(token);
  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();
  if (userError || !user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  try {
    assertEmailVerified(user);
  } catch (err) {
    const blocked = aiAbuseResponse(err);
    if (blocked) return { error: blocked };
    throw err;
  }
  return { userClient, user };
}

/** GET /api/chat/threads?vehicleId= — list open threads for this garage vehicle. */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireUser(req);
    if ("error" in auth && auth.error) return auth.error;
    const { userClient, user } = auth as {
      userClient: ReturnType<typeof createSupabaseUserClient>;
      user: { id: string };
    };

    const vehicleId = req.nextUrl.searchParams.get("vehicleId")?.trim();
    if (!vehicleId) {
      return NextResponse.json(
        { error: "vehicleId is required." },
        { status: 400 },
      );
    }

    const owned = await loadOwnedGarageVehicle(userClient, user.id, vehicleId);
    if (!owned) {
      return NextResponse.json(
        {
          error: "This vehicle is not in your garage.",
          code: VEHICLE_NOT_OWNED_CODE,
        },
        { status: 403 },
      );
    }

    const threads = await listVehicleThreads({
      client: userClient,
      userId: user.id,
      vehicleId,
    });

    return NextResponse.json({
      threads: threads.map((t) => ({
        ...t,
        displayTitle: formatThreadTitle(t.title, t.lastMessageAt || t.createdAt),
      })),
    });
  } catch (err) {
    const blocked = aiAbuseResponse(err);
    if (blocked) return blocked;
    console.error("[/api/chat/threads GET]", err);
    return NextResponse.json(
      { error: "Could not list chat topics." },
      { status: 500 },
    );
  }
}

/** POST /api/chat/threads { vehicleId } — New topic (empty sibling thread). */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireUser(req);
    if ("error" in auth && auth.error) return auth.error;
    const { userClient, user } = auth as {
      userClient: ReturnType<typeof createSupabaseUserClient>;
      user: { id: string };
    };

    const body = (await req.json().catch(() => ({}))) as {
      vehicleId?: string;
    };
    const vehicleId = body.vehicleId?.trim();
    if (!vehicleId) {
      return NextResponse.json(
        { error: "vehicleId is required." },
        { status: 400 },
      );
    }

    const owned = await loadOwnedGarageVehicle(userClient, user.id, vehicleId);
    if (!owned) {
      return NextResponse.json(
        {
          error: "This vehicle is not in your garage.",
          code: VEHICLE_NOT_OWNED_CODE,
        },
        { status: 403 },
      );
    }

    const thread = await createChatThread(userClient, user.id, vehicleId);
    return NextResponse.json({
      threadId: thread.id,
      vehicleId: thread.vehicle_id,
      title: thread.title ?? null,
      createdAt: thread.created_at,
    });
  } catch (err) {
    const blocked = aiAbuseResponse(err);
    if (blocked) return blocked;
    console.error("[/api/chat/threads POST]", err);
    return NextResponse.json(
      { error: "Could not create a new topic." },
      { status: 500 },
    );
  }
}
