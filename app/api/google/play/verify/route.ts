import { NextRequest, NextResponse } from "next/server";
import { aiAbuseResponse, requireVerifiedAiUser } from "@/lib/ai-abuse";
import {
  applyGooglePlayPurchase,
  GooglePlayVerifyError,
} from "@/lib/google-play-server";

export const runtime = "nodejs";

/**
 * POST /api/google/play/verify
 * Body: { purchaseToken, productId, packageName, orderId? }
 * Auth: signed-in user. Entitlement is written only after Google confirms it.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireVerifiedAiUser(req);
    const body = (await req.json()) as {
      purchaseToken?: string;
      productId?: string;
      packageName?: string;
      orderId?: string;
    };

    const result = await applyGooglePlayPurchase({
      userId: user.id,
      purchaseToken: body.purchaseToken ?? "",
      productId: body.productId ?? "",
      packageName: body.packageName ?? "",
      orderId: body.orderId,
    });

    return NextResponse.json({
      ok: true,
      status: result.status,
      productId: body.productId,
      expiresAt: result.expiresAt,
      applied: result.applied,
      source: "google_play",
    });
  } catch (err) {
    const abuse = aiAbuseResponse(err);
    if (abuse) return abuse;
    if (err instanceof GooglePlayVerifyError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error(
      "[google/play/verify]",
      err instanceof Error ? err.name : "error",
    );
    return NextResponse.json(
      { error: "Unable to verify Google Play purchase." },
      { status: 400 },
    );
  }
}
