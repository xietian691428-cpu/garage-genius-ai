import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import {
  getAdminTokenStats,
  type TokenStatsRange,
} from "@/lib/admin-token-stats";

export const runtime = "nodejs";

function parseRange(raw: string | null): TokenStatsRange {
  if (raw === "day" || raw === "week" || raw === "month") return raw;
  return "week";
}

/**
 * Admin-only token usage aggregates.
 * Auth: Garage Genius admin session cookie (same as /admin UI).
 */
export async function GET(req: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const range = parseRange(req.nextUrl.searchParams.get("range"));

  try {
    const stats = await getAdminTokenStats(range);
    return NextResponse.json(stats);
  } catch (err) {
    console.error("[/api/admin/token-stats]", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to load token stats",
      },
      { status: 500 },
    );
  }
}
