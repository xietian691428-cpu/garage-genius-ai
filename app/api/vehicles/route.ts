import { NextRequest, NextResponse } from "next/server";
import {
  assertEmailVerified,
  aiAbuseResponse,
  getBearerToken,
} from "@/lib/ai-abuse";
import { createSupabaseUserClient } from "@/lib/supabase-admin";
import {
  assertCanAddVehicle,
  VehicleLimitError,
} from "@/lib/vehicle-limits";
import type { VehicleInfo } from "@/lib/types/chat";
import {
  rowToVehicleInfo,
  vehicleInfoToRow,
  type UserVehicleRow,
} from "@/lib/user-vehicles";
import {
  decodeVinValues,
  isFreshVpicSnapshot,
  mergeVpicIntoVehicle,
} from "@/lib/vehicle-data/nhtsa-vpic";
import { normalizeVin } from "@/lib/vehicle-data/vin";

export const runtime = "nodejs";

function isUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    id,
  );
}

/**
 * POST /api/vehicles — create garage vehicle with server-side plan limit.
 * Body: { vehicle: VehicleInfo, makeCurrent?: boolean }
 */
export async function POST(req: NextRequest) {
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

    await assertCanAddVehicle(user.id);

    const body = (await req.json()) as {
      vehicle?: VehicleInfo;
      makeCurrent?: boolean;
    };
    const vehicle = body.vehicle;
    if (!vehicle?.year || !vehicle.make?.trim() || !vehicle.model?.trim()) {
      return NextResponse.json(
        { error: "Year, make, and model are required." },
        { status: 400 },
      );
    }

    const makeCurrent = body.makeCurrent !== false;

    let enriched = vehicle;
    const vin = normalizeVin(vehicle.vin);
    const hasFreshVpic = isFreshVpicSnapshot(vehicle.vpicDecode);
    if (vin && !hasFreshVpic) {
      const decoded = await decodeVinValues(vin);
      if (decoded) {
        enriched = mergeVpicIntoVehicle(vehicle, decoded);
      }
    }

    const payload = vehicleInfoToRow(enriched, user.id, {
      isCurrent: makeCurrent,
    });
    const insertPayload: Record<string, unknown> = { ...payload };
    if (!isUuid(String(payload.id))) {
      delete insertPayload.id;
    }

    let { data, error } = await userClient
      .from("user_vehicles")
      .insert(insertPayload)
      .select("*")
      .single();

    if (error && /license_plate/i.test(error.message)) {
      delete insertPayload.license_plate;
      const retry = await userClient
        .from("user_vehicles")
        .insert(insertPayload)
        .select("*")
        .single();
      data = retry.data;
      error = retry.error;
    }
    if (error && /vpic_decode|vpic_decoded_at/i.test(error.message)) {
      delete insertPayload.vpic_decode;
      delete insertPayload.vpic_decoded_at;
      const retry = await userClient
        .from("user_vehicles")
        .insert(insertPayload)
        .select("*")
        .single();
      data = retry.data;
      error = retry.error;
    }
    if (
      error &&
      /mileage_unit|mileage_source|mileage_updated_at/i.test(error.message)
    ) {
      delete insertPayload.mileage_unit;
      delete insertPayload.mileage_source;
      delete insertPayload.mileage_updated_at;
      const retry = await userClient
        .from("user_vehicles")
        .insert(insertPayload)
        .select("*")
        .single();
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      if (/VEHICLE_LIMIT_REACHED|Plan limit/i.test(error.message)) {
        return NextResponse.json(
          {
            error: error.message.replace(/^.*VEHICLE_LIMIT_REACHED:\s*/i, "") ||
              "Plan vehicle limit reached.",
            code: "VEHICLE_LIMIT_REACHED",
          },
          { status: 403 },
        );
      }
      console.error("[api/vehicles]", error.message);
      return NextResponse.json(
        { error: "Could not save vehicle." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      vehicle: rowToVehicleInfo(data as UserVehicleRow),
    });
  } catch (err) {
    if (err instanceof VehicleLimitError) {
      return NextResponse.json(
        {
          error: err.message,
          code: err.code,
          maxVehicles: err.maxVehicles,
          currentCount: err.currentCount,
        },
        { status: err.status },
      );
    }
    const blocked = aiAbuseResponse(err);
    if (blocked) return blocked;
    console.error("[api/vehicles]", err);
    return NextResponse.json(
      { error: "Could not save vehicle." },
      { status: 500 },
    );
  }
}
