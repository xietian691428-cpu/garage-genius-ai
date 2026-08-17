import { NextRequest, NextResponse } from "next/server";
import {
  aiAbuseResponse,
  requireVerifiedAiUser,
} from "@/lib/ai-abuse";
import {
  applyAppleTransactionToProfile,
  resolveUserIdForApplePayload,
  verifySignedTransaction,
} from "@/lib/apple-iap-server";
import { planFromAppleProductId } from "@/lib/apple-iap-products";

export const runtime = "nodejs";

/**
 * POST /api/apple/verify
 * Body: { signedTransaction: string, environment?: "Sandbox" | "Production" }
 * Auth: Bearer Supabase JWT
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireVerifiedAiUser(req);
    const body = (await req.json()) as {
      signedTransaction?: string;
      environment?: "Sandbox" | "Production";
    };

    const signedTransaction = body.signedTransaction?.trim();
    if (!signedTransaction) {
      return NextResponse.json(
        { error: "signedTransaction is required." },
        { status: 400 },
      );
    }

    const { payload, environment } = await verifySignedTransaction(
      signedTransaction,
      body.environment === "Sandbox" ? "Sandbox" : "Production",
    );

    if (!planFromAppleProductId(payload.productId ?? "")) {
      return NextResponse.json(
        { error: `Unsupported product: ${payload.productId ?? ""}` },
        { status: 400 },
      );
    }

    const linked = await resolveUserIdForApplePayload(payload, user.id);
    if (linked && linked !== user.id) {
      return NextResponse.json(
        {
          error:
            "This Apple subscription is already linked to another Garage Genius account.",
        },
        { status: 409 },
      );
    }

    // Bind appAccountToken when present — must match signed-in user.
    const token = payload.appAccountToken?.trim()?.toLowerCase();
    if (token && token !== user.id.toLowerCase()) {
      return NextResponse.json(
        { error: "Purchase appAccountToken does not match this account." },
        { status: 403 },
      );
    }

    const { status } = await applyAppleTransactionToProfile({
      userId: user.id,
      payload,
      environment,
    });

    return NextResponse.json({
      ok: true,
      status,
      productId: payload.productId,
      originalTransactionId: payload.originalTransactionId,
      environment,
      expiresDate: payload.expiresDate
        ? new Date(payload.expiresDate).toISOString()
        : null,
    });
  } catch (err) {
    const abuse = aiAbuseResponse(err);
    if (abuse) return abuse;
    console.error("[apple/verify]", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Unable to verify Apple purchase.",
      },
      { status: 400 },
    );
  }
}
