import { NextRequest, NextResponse } from "next/server";
import {
  assertEmailVerified,
  aiAbuseResponse,
  getBearerToken,
} from "@/lib/ai-abuse";
import { createSupabaseUserClient } from "@/lib/supabase-admin";
import { getAppBaseUrl } from "@/lib/app-url";
import { isShopReportExpired } from "@/lib/shop-report/public-view";
import type { ShopReportListItem, ShopReportPayload } from "@/lib/types/shop-report";

export const runtime = "nodejs";

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

    const vehicleId = req.nextUrl.searchParams.get("vehicleId")?.trim();
    if (!vehicleId) {
      return NextResponse.json(
        { error: "vehicleId is required." },
        { status: 400 },
      );
    }

    let data: Array<Record<string, unknown>> | null = null;
    let error: { message: string } | null = null;

    {
      const full = await userClient
        .from("shop_reports")
        .select(
          "id, report_code, source, created_at, expires_at, public_token, payload",
        )
        .eq("vehicle_id", vehicleId)
        .order("created_at", { ascending: false })
        .limit(50);

      if (
        full.error &&
        /expires_at|public_token|does not exist|schema cache/i.test(
          full.error.message,
        )
      ) {
        console.warn(
          "[shop-report/list] apply migration 034_shop_report_public_and_plate.sql:",
          full.error.message,
        );
        const lean = await userClient
          .from("shop_reports")
          .select("id, report_code, source, created_at, payload")
          .eq("vehicle_id", vehicleId)
          .order("created_at", { ascending: false })
          .limit(50);
        data = (lean.data as Array<Record<string, unknown>> | null) ?? null;
        error = lean.error;
      } else {
        data = (full.data as Array<Record<string, unknown>> | null) ?? null;
        error = full.error;
      }
    }

    if (error) {
      console.error("[shop-report/list]", error.message);
      return NextResponse.json(
        {
          error:
            /public_token|expires_at|does not exist|schema cache/i.test(
              error.message,
            )
              ? "Shop reports archive needs migration 034. Apply it in Supabase, then retry."
              : "Could not load shop reports.",
        },
        { status: 500 },
      );
    }

    const base = getAppBaseUrl(req.nextUrl.origin);
    const reports: ShopReportListItem[] = (data || []).map((row) => {
      const payload = row.payload as ShopReportPayload;
      const expired = isShopReportExpired(
        (row.expires_at as string | null | undefined) ?? null,
      );
      const publicToken =
        (row.public_token as string | null | undefined) || null;
      return {
        id: row.id as string,
        reportCode: row.report_code as string,
        source: row.source as ShopReportListItem["source"],
        createdAt: row.created_at as string,
        expiresAt: (row.expires_at as string | null | undefined) || null,
        publicToken,
        codes: (payload?.diagnosticData?.codes || []).map((c) => c.code),
        status: expired || !publicToken ? "expired" : "active",
        publicUrl:
          publicToken && !expired ? `${base}/r/${publicToken}` : null,
      };
    });

    return NextResponse.json({ reports });
  } catch (err) {
    const blocked = aiAbuseResponse(err);
    if (blocked) return blocked;
    console.error("[shop-report/list]", err);
    return NextResponse.json(
      { error: "Could not load shop reports." },
      { status: 500 },
    );
  }
}
