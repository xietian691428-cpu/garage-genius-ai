import { NextRequest, NextResponse } from "next/server";
import {
  assertEmailVerified,
  aiAbuseResponse,
  getBearerToken,
} from "@/lib/ai-abuse";
import { createSupabaseUserClient } from "@/lib/supabase-admin";
import {
  loadOwnedGarageVehicle,
  VEHICLE_NOT_OWNED_CODE,
} from "@/lib/chat-vehicle-ownership";
import {
  getActiveVehicleManual,
  toManualClientDto,
} from "@/lib/vehicle-manuals";
import { logManualObserve } from "@/lib/manual-observe";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** POST { confirm: true } — owner acknowledges YMM mismatch / enables retrieval. */
export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { id: vehicleId } = await ctx.params;
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

    const owned = await loadOwnedGarageVehicle(userClient, user.id, vehicleId);
    if (!owned) {
      return NextResponse.json(
        {
          error: "This vehicle is not in your garage.",
          code: VEHICLE_NOT_OWNED_CODE,
        },
        { status: 403 },
      );
    }

    const body = (await req.json().catch(() => ({}))) as { confirm?: boolean };
    if (body.confirm !== true) {
      return NextResponse.json(
        { error: "confirm: true is required." },
        { status: 400 },
      );
    }

    const row = await getActiveVehicleManual(userClient, user.id, vehicleId);
    if (!row || row.status !== "ready") {
      return NextResponse.json(
        { error: "No ready manual to confirm." },
        { status: 404 },
      );
    }

    const { data, error } = await userClient
      .from("vehicle_manuals")
      .update({ user_confirmed_match: true })
      .eq("id", row.id)
      .eq("user_id", user.id)
      .select("*")
      .single();
    if (error) throw error;

    logManualObserve(
      "mismatch_confirmed",
      { ymmMatch: row.ymm_match },
      { userId: user.id },
    );

    return NextResponse.json({ manual: toManualClientDto(data as never) });
  } catch (err) {
    const blocked = aiAbuseResponse(err);
    if (blocked) return blocked;
    console.error("[/api/vehicles/:id/manual/confirm]", err);
    return NextResponse.json(
      { error: "Could not confirm manual." },
      { status: 500 },
    );
  }
}
