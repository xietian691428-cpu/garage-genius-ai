import { NextRequest, NextResponse } from "next/server";
import {
  assertEmailVerified,
  aiAbuseResponse,
  getBearerToken,
} from "@/lib/ai-abuse";
import { createSupabaseUserClient } from "@/lib/supabase-admin";
import { getShopReportQuota } from "@/lib/shop-report-limits";

export const runtime = "nodejs";

/** GET /api/shop-report/quota — monthly shop report entitlement remaining. */
export async function GET(req: NextRequest) {
  try {
    const token = getBearerToken(req);
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userClient = createSupabaseUserClient(token);
    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    try {
      assertEmailVerified(user);
    } catch (err) {
      const blocked = aiAbuseResponse(err);
      if (blocked) return blocked;
      throw err;
    }

    const quota = await getShopReportQuota(user.id);
    return NextResponse.json({ quota });
  } catch (err) {
    const blocked = aiAbuseResponse(err);
    if (blocked) return blocked;
    return NextResponse.json(
      { error: "Could not load shop report quota." },
      { status: 500 },
    );
  }
}
