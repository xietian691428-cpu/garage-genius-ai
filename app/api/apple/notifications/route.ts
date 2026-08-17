import { NextRequest, NextResponse } from "next/server";
import { handleAppleNotificationPayload } from "@/lib/apple-iap-server";

export const runtime = "nodejs";

/**
 * App Store Server Notifications V2
 * Configure in App Store Connect → App → App Store Server Notifications
 * URL: https://garagegenius.cloud/api/apple/notifications
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { signedPayload?: string };
    const signedPayload = body.signedPayload?.trim();
    if (!signedPayload) {
      return NextResponse.json(
        { error: "signedPayload required" },
        { status: 400 },
      );
    }
    await handleAppleNotificationPayload(signedPayload);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[apple/notifications]", err);
    // Return 200 for malformed retries carefully — Apple retries on 5xx.
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Notification handling failed",
      },
      { status: 500 },
    );
  }
}
