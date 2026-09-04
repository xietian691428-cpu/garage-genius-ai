import { NextRequest, NextResponse } from "next/server";
import {
  aiAbuseResponse,
  assertEmailVerified,
  getBearerToken,
} from "@/lib/ai-abuse";
import { createSupabaseUserClient } from "@/lib/supabase-admin";
import { fetchRecallsByYmm } from "@/lib/vehicle-data/nhtsa-recalls";
import { isNhtsaRecallMarket } from "@/lib/vehicle-data/recall-copy";

export const runtime = "nodejs";
export const maxDuration = 15;

/**
 * GET /api/vehicles/safety-hints?year=&make=&model=&market=
 * Educational NHTSA recall titles only — never a completion status.
 * Non-US markets skip NHTSA (client shows regional copy).
 */
export async function GET(req: NextRequest) {
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

    const { searchParams } = new URL(req.url);
    const year = Number(searchParams.get("year"));
    const make = searchParams.get("make") || "";
    const model = searchParams.get("model") || "";
    const market = searchParams.get("market");

    if (!isNhtsaRecallMarket(market)) {
      return NextResponse.json({
        unavailable: false,
        skipped: true,
        reason: "nhtsa_us_only",
        total: 0,
        hints: [],
      });
    }

    const result = await fetchRecallsByYmm(year, make, model);
    if (!result) {
      return NextResponse.json({
        unavailable: true,
        total: 0,
        hints: [],
      });
    }

    return NextResponse.json({
      unavailable: false,
      source: result.source,
      year: result.year,
      make: result.make,
      model: result.model,
      total: result.total,
      hints: result.hints,
      cached: result.cached,
    });
  } catch (err) {
    const blocked = aiAbuseResponse(err);
    if (blocked) return blocked;
    return NextResponse.json({
      unavailable: true,
      total: 0,
      hints: [],
    });
  }
}
