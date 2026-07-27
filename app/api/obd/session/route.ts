import { NextRequest, NextResponse } from "next/server";
import { createSupabaseUserClient } from "@/lib/supabase-admin";
import type { ObdSessionSnapshot } from "@/lib/types/obd-session";

export const runtime = "nodejs";

/**
 * POST /api/obd/session
 * Optional client telemetry for a BLE OBD snapshot (auth required).
 * Does not store PIDs long-term yet — validates payload shape for future CRM/ops.
 */
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return NextResponse.json(
      { error: "Sign in required", code: "AUTH_REQUIRED" },
      { status: 401 },
    );
  }

  const token = auth.slice(7).trim();
  const userClient = createSupabaseUserClient(token);
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "Sign in required", code: "AUTH_REQUIRED" },
      { status: 401 },
    );
  }

  let body: { snapshot?: ObdSessionSnapshot; vehicle_id?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const snap = body.snapshot;
  if (!snap || typeof snap !== "object" || !Array.isArray(snap.codes)) {
    return NextResponse.json(
      { error: "snapshot with codes[] required" },
      { status: 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    received: {
      deviceName: snap.deviceName ?? null,
      codeCount: snap.codes.length,
      connected: Boolean(snap.connected),
      at: snap.at ?? null,
      vehicleId: body.vehicle_id ?? null,
      userId: user.id,
    },
  });
}
