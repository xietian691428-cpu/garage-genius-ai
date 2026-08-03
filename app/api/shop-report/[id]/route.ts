import { NextRequest, NextResponse } from "next/server";
import {
  assertEmailVerified,
  aiAbuseResponse,
  getBearerToken,
} from "@/lib/ai-abuse";
import { createSupabaseUserClient } from "@/lib/supabase-admin";
import type { ShopReportPayload } from "@/lib/types/shop-report";
import { toPublicShopReportPayload } from "@/lib/shop-report/public-view";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
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

    const { id } = await ctx.params;
    const { data, error } = await userClient
      .from("shop_reports")
      .select("id, report_code, payload, expires_at, public_token, source")
      .eq("id", id)
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json({ error: "Report not found." }, { status: 404 });
    }

    return NextResponse.json({
      id: data.id,
      reportCode: data.report_code,
      source: data.source,
      expiresAt: data.expires_at,
      publicToken: data.public_token,
      payload: toPublicShopReportPayload(data.payload as ShopReportPayload),
    });
  } catch (err) {
    const blocked = aiAbuseResponse(err);
    if (blocked) return blocked;
    return NextResponse.json({ error: "Could not load report." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
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

    const { id } = await ctx.params;
    const { error } = await userClient
      .from("shop_reports")
      .delete()
      .eq("id", id);

    if (error) {
      return NextResponse.json(
        { error: "Could not delete report." },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const blocked = aiAbuseResponse(err);
    if (blocked) return blocked;
    return NextResponse.json(
      { error: "Could not delete report." },
      { status: 500 },
    );
  }
}
