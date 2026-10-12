import { NextRequest, NextResponse } from "next/server";
import { createSupabaseUserClient } from "@/lib/supabase-admin";
import { decodeVinValues } from "@/lib/vehicle-data/nhtsa-vpic";
import { maskVin, normalizeVin } from "@/lib/vehicle-data/vin";

export const runtime = "nodejs";
export const maxDuration = 15;

export type ObdVinStatus = "match" | "mismatch" | "missing" | "saved";

export type ObdVinResponse = {
  status: ObdVinStatus;
  /** NHTSA year / make / model for the VIN the car reported */
  decoded: { year: number | null; make: string | null; model: string | null } | null;
};

function getBearer(req: NextRequest): string | null {
  const h = req.headers.get("authorization");
  if (!h?.startsWith("Bearer ")) return null;
  return h.slice(7).trim() || null;
}

/**
 * POST /api/obd/vin — compare the VIN read over OBD (Mode 09) with the
 * selected garage vehicle. `save: true` stores it only when the vehicle has
 * no VIN yet; an existing VIN is never overwritten here.
 */
export async function POST(req: NextRequest) {
  const token = getBearer(req);
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const client = createSupabaseUserClient(token);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    vehicleId?: string;
    vin?: string;
    save?: boolean;
  };
  const vehicleId = typeof body.vehicleId === "string" ? body.vehicleId.trim() : "";
  const vin = normalizeVin(body.vin);
  if (!vehicleId || !vin) {
    return NextResponse.json({ error: "vehicleId and a 17-character VIN are required" }, { status: 400 });
  }

  const { data: vehicle, error } = await client
    .from("user_vehicles")
    .select("id, vin")
    .eq("id", vehicleId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error || !vehicle) {
    return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
  }

  const decode = await decodeVinValues(vin, { timeoutMs: 6_000 });
  const decoded = decode
    ? { year: decode.year ?? null, make: decode.make ?? null, model: decode.model ?? null }
    : null;

  const current = normalizeVin(vehicle.vin as string | null);
  let status: ObdVinStatus;
  if (current) {
    status = current === vin ? "match" : "mismatch";
  } else if (body.save) {
    const { error: saveError } = await client
      .from("user_vehicles")
      .update({ vin })
      .eq("id", vehicleId)
      .eq("user_id", user.id);
    if (saveError) {
      console.warn("[obd/vin] save failed:", saveError.message, maskVin(vin));
      return NextResponse.json({ error: "Could not save VIN" }, { status: 500 });
    }
    status = "saved";
  } else {
    status = "missing";
  }

  return NextResponse.json({ status, decoded } satisfies ObdVinResponse);
}
