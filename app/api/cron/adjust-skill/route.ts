import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { maybeAdjustDiySkill } from "@/lib/skill-inference";

export const runtime = "nodejs";

/**
 * Weekly DIY skill band adjust (soft inference).
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
      limit?: number;
      force?: boolean;
    };
    const limit = Math.min(body.limit ?? 80, 200);
    const admin = createSupabaseAdmin();

    // Active users with recent coach feedback or chat
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recent } = await admin
      .from("coach_step_feedback")
      .select("user_id")
      .gte("created_at", since)
      .not("user_id", "is", null)
      .limit(2000);

    const userIds = [
      ...new Set(
        (recent ?? [])
          .map((r) => r.user_id as string | null)
          .filter((id): id is string => Boolean(id)),
      ),
    ].slice(0, limit);

    const results = [];
    for (const userId of userIds) {
      results.push(
        await maybeAdjustDiySkill(userId, {
          force: Boolean(body.force),
          notify: true,
        }),
      );
    }

    const changed = results.filter((r) => r.changed).length;
    return NextResponse.json({
      ok: true,
      scanned: userIds.length,
      changed,
      sample: results.filter((r) => r.changed).slice(0, 10),
    });
  } catch (err) {
    console.error("[/api/cron/adjust-skill]", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "adjust-skill failed",
      },
      { status: 500 },
    );
  }
}
