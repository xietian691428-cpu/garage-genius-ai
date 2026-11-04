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
  garagePatchForExtractConfirm,
  listPendingExtracts,
  normalizeExtractKind,
  normalizeTransmissionKind,
  toExtractClientDto,
  type ExtractField,
  type FluidsSource,
} from "@/lib/vehicle-manual-extract";
import { rowToVehicleInfo, type UserVehicleRow } from "@/lib/user-vehicles";
import { logManualObserve } from "@/lib/manual-observe";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

async function requireOwned(req: NextRequest, vehicleId: string) {
  const token = getBearerToken(req);
  if (!token) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  const userClient = createSupabaseUserClient(token);
  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();
  if (userError || !user) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  try {
    assertEmailVerified(user);
  } catch (err) {
    const blocked = aiAbuseResponse(err);
    if (blocked) return { error: blocked };
    throw err;
  }
  const owned = await loadOwnedGarageVehicle(userClient, user.id, vehicleId);
  if (!owned) {
    return {
      error: NextResponse.json(
        {
          error: "This vehicle is not in your garage.",
          code: VEHICLE_NOT_OWNED_CODE,
        },
        { status: 403 },
      ),
    };
  }
  return { userClient, user, vehicle: owned };
}

/** GET pending oil/coolant extract candidates for this vehicle. */
export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const { id: vehicleId } = await ctx.params;
    const auth = await requireOwned(req, vehicleId);
    if ("error" in auth && auth.error) return auth.error;
    const { userClient, user } = auth as Awaited<
      ReturnType<typeof requireOwned>
    > & { userClient: ReturnType<typeof createSupabaseUserClient>; user: { id: string } };

    const rows = await listPendingExtracts(userClient, user.id, vehicleId);
    return NextResponse.json({ extracts: rows.map(toExtractClientDto) });
  } catch (err) {
    const blocked = aiAbuseResponse(err);
    if (blocked) return blocked;
    console.error("[/api/vehicles/:id/manual/extracts GET]", err);
    return NextResponse.json(
      { error: "Could not load extract candidates." },
      { status: 500 },
    );
  }
}

/**
 * POST { action: confirm|reject|edit, candidateId, value? }
 * Confirm writes garage fluids. Never silent.
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { id: vehicleId } = await ctx.params;
    const auth = await requireOwned(req, vehicleId);
    if ("error" in auth && auth.error) return auth.error;
    const { userClient, user } = auth as Awaited<
      ReturnType<typeof requireOwned>
    > & { userClient: ReturnType<typeof createSupabaseUserClient>; user: { id: string } };

    const body = (await req.json().catch(() => ({}))) as {
      action?: string;
      candidateId?: string;
      value?: string;
    };
    const action = body.action;
    const candidateId = body.candidateId?.trim();
    if (
      !candidateId ||
      (action !== "confirm" && action !== "reject" && action !== "edit")
    ) {
      return NextResponse.json(
        { error: "action (confirm|reject|edit) and candidateId are required." },
        { status: 400 },
      );
    }

    const { data: candidate, error: loadErr } = await userClient
      .from("vehicle_manual_extract_candidates")
      .select("*")
      .eq("id", candidateId)
      .eq("user_id", user.id)
      .eq("vehicle_id", vehicleId)
      .eq("status", "pending")
      .maybeSingle();
    if (loadErr) throw loadErr;
    if (!candidate) {
      return NextResponse.json(
        { error: "No pending extract to update." },
        { status: 404 },
      );
    }

    const field = candidate.field as ExtractField;
    const kind = normalizeExtractKind(candidate.kind, field);
    const edited = (body.value || "").trim().slice(0, 80);
    const now = new Date().toISOString();

    if (action === "reject") {
      const { error } = await userClient
        .from("vehicle_manual_extract_candidates")
        .update({ status: "rejected", resolved_at: now })
        .eq("id", candidateId)
        .eq("user_id", user.id);
      if (error) throw error;
      logManualObserve(
        "extract_reject",
        { field, kind },
        { userId: user.id },
      );
    } else {
      const useEdited = action === "edit" || (edited && edited !== candidate.value);
      const value = useEdited ? edited || candidate.value : candidate.value;
      if (!value) {
        return NextResponse.json(
          { error: "A value is required to save." },
          { status: 400 },
        );
      }
      const source: FluidsSource = useEdited
        ? "user_entered"
        : "user_manual_confirmed";
      const patch = garagePatchForExtractConfirm({
        field,
        kind,
        value,
        source,
        now,
        transmissionKind: normalizeTransmissionKind(
          (candidate as { transmission_kind?: string | null }).transmission_kind,
        ),
      });
      const { error: vehErr } = await userClient
        .from("user_vehicles")
        .update(patch)
        .eq("id", vehicleId)
        .eq("user_id", user.id);
      if (vehErr) throw vehErr;

      const { error } = await userClient
        .from("vehicle_manual_extract_candidates")
        .update({
          status: "confirmed",
          value,
          resolved_at: now,
        })
        .eq("id", candidateId)
        .eq("user_id", user.id);
      if (error) throw error;
      logManualObserve(
        useEdited ? "extract_edit" : "extract_confirm",
        { field, kind, source },
        { userId: user.id },
      );
    }

    const remaining = await listPendingExtracts(userClient, user.id, vehicleId);
    const { data: vehRow } = await userClient
      .from("user_vehicles")
      .select("*")
      .eq("id", vehicleId)
      .eq("user_id", user.id)
      .maybeSingle();
    return NextResponse.json({
      ok: true,
      extracts: remaining.map(toExtractClientDto),
      vehicle: vehRow
        ? rowToVehicleInfo(vehRow as UserVehicleRow)
        : null,
    });
  } catch (err) {
    const blocked = aiAbuseResponse(err);
    if (blocked) return blocked;
    console.error("[/api/vehicles/:id/manual/extracts POST]", err);
    return NextResponse.json(
      { error: "Could not update extract candidate." },
      { status: 500 },
    );
  }
}
