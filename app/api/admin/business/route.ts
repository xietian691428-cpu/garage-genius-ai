import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import {
  getBusinessPlaybooks,
  getChatThreadMessages,
  listRecentChatThreads,
  type BusinessPlaybookFilters,
} from "@/lib/admin-business";

export const runtime = "nodejs";

/**
 * Business management APIs.
 * ?view=playbooks (default) | chats | thread
 */
export async function GET(req: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const view = sp.get("view") || "playbooks";

  try {
    if (view === "chats") {
      const data = await listRecentChatThreads(
        Number(sp.get("limit") || 80) || 80,
      );
      return NextResponse.json(data);
    }

    if (view === "thread") {
      const userId = sp.get("userId")?.trim();
      const vehicleId = sp.get("vehicleId")?.trim();
      if (!userId || !vehicleId) {
        return NextResponse.json(
          { error: "userId and vehicleId required" },
          { status: 400 },
        );
      }
      const messages = await getChatThreadMessages(userId, vehicleId);
      return NextResponse.json({ messages });
    }

    const filters: BusinessPlaybookFilters = {
      make: sp.get("make") || undefined,
      model: sp.get("model") || undefined,
      scenarioSlug: sp.get("scenarioSlug") || undefined,
      vote: (sp.get("vote") as "yes" | "no" | "") || undefined,
      q: sp.get("q") || undefined,
      limit: Number(sp.get("limit") || 200) || 200,
    };
    const data = await getBusinessPlaybooks(filters);
    return NextResponse.json(data);
  } catch (err) {
    console.error("[/api/admin/business]", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to load business data",
      },
      { status: 500 },
    );
  }
}
