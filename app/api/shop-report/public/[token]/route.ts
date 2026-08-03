import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import {
  isShopReportExpired,
  toPublicShopReportPayload,
} from "@/lib/shop-report/public-view";
import type { ShopReportPayload } from "@/lib/types/shop-report";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ token: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const { token } = await ctx.params;
    const publicToken = (token || "").trim();
    if (!publicToken || publicToken.length < 16) {
      return NextResponse.json(
        { error: "Report not found.", code: "not_found" },
        { status: 404 },
      );
    }

    const admin = createSupabaseAdmin();
    const { data, error } = await admin
      .from("shop_reports")
      .select("payload, expires_at, report_code, public_token")
      .eq("public_token", publicToken)
      .maybeSingle();

    if (error) {
      console.error("[shop-report/public]", error.message);
      return NextResponse.json(
        { error: "Unable to load report.", code: "error" },
        { status: 500 },
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: "Report not found.", code: "not_found" },
        { status: 404 },
      );
    }

    if (isShopReportExpired(data.expires_at as string | null)) {
      return NextResponse.json(
        {
          error:
            "This shop report link has expired (links are valid for 30 days).",
          code: "expired",
          reportId: data.report_code,
        },
        { status: 410 },
      );
    }

    const payload = toPublicShopReportPayload(
      data.payload as ShopReportPayload,
    );

    return NextResponse.json({
      payload,
      expires_at: data.expires_at,
      reportId: data.report_code,
    });
  } catch (err) {
    console.error("[shop-report/public]", err);
    return NextResponse.json(
      { error: "Unable to load report." },
      { status: 500 },
    );
  }
}
