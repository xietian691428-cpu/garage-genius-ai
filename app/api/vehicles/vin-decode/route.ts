import { NextRequest, NextResponse } from "next/server";
import {
  aiAbuseResponse,
  assertEmailVerified,
  getBearerToken,
} from "@/lib/ai-abuse";
import { createSupabaseUserClient } from "@/lib/supabase-admin";
import { decodeVinValues } from "@/lib/vehicle-data/nhtsa-vpic";
import { normalizeVin, vinCheckDigitOk } from "@/lib/vehicle-data/vin";

export const runtime = "nodejs";
export const maxDuration = 15;

/**
 * POST /api/vehicles/vin-decode
 * Body: { vin: string, vehicleId?: string }
 * Server-only NHTSA vPIC. Fail-open if NHTSA is down (decode: null).
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

    const body = (await req.json()) as {
      vin?: string;
      vehicleId?: string;
    };
    const vin = normalizeVin(body.vin);
    if (!vin) {
      return NextResponse.json(
        {
          error:
            "Enter a 17-character VIN (letters/numbers, no I, O, or Q).",
          decode: null,
        },
        { status: 400 },
      );
    }

    const decode = await decodeVinValues(vin);
    if (decode && body.vehicleId) {
      const { cached: _cached, ...snapshot } = decode;
      const { error } = await userClient
        .from("user_vehicles")
        .update({
          vpic_decode: snapshot,
          vpic_decoded_at: snapshot.decodedAt,
        })
        .eq("id", body.vehicleId)
        .eq("user_id", user.id);
      if (error && !/vpic_decode|vpic_decoded_at/i.test(error.message)) {
        console.warn("[vin-decode] persist skipped:", error.message);
      }
    }

    return NextResponse.json({
      decode,
      unavailable: !decode,
      checkDigitOk: vinCheckDigitOk(vin),
    });
  } catch (err) {
    const blocked = aiAbuseResponse(err);
    if (blocked) return blocked;
    console.error("[vin-decode]", err);
    return NextResponse.json(
      { error: "Could not decode VIN.", decode: null, unavailable: true },
      { status: 200 },
    );
  }
}
