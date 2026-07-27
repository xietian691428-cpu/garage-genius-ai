import { NextRequest, NextResponse } from "next/server";
import { enqueueRecentCoachDownvotes } from "@/lib/flywheel";

export const runtime = "nodejs";

/**
 * Daily (or manual) flywheel enqueue: coach “no” votes → review_queue.
 * Auth: Authorization: Bearer $CRON_SECRET
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = req.headers.get("authorization") || "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as {
      days?: number;
      limit?: number;
    };
    const result = await enqueueRecentCoachDownvotes({
      days: body.days ?? 7,
      limit: body.limit ?? 200,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[/api/cron/flywheel-enqueue]", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Enqueue failed",
      },
      { status: 500 },
    );
  }
}
