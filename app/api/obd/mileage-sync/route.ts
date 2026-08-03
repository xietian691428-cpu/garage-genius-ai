import { NextRequest, NextResponse } from "next/server";
import {
  createSupabaseAdmin,
  createSupabaseUserClient,
} from "@/lib/supabase-admin";
import {
  canAttemptObdMileageWriteback,
  convertOdometerKmToUnit,
  formatMileageWithUnit,
  mileageUnitFromMarket,
  normalizeMileageUnit,
  shouldWriteObdMileage,
  type MileageUnit,
} from "@/lib/obd-mileage";

export const runtime = "nodejs";

/** Soft upper bound — rejects garbage BLE frames. */
const MAX_ODOMETER_KM = 3_000_000;

function getBearer(req: NextRequest): string | null {
  const h = req.headers.get("authorization");
  if (!h?.startsWith("Bearer ")) return null;
  return h.slice(7).trim() || null;
}

async function logObdMileageSynced(input: {
  userId: string;
  vehicleId: string;
  mileage: number;
  unit: MileageUnit;
  previousMileage: number;
  action: "write" | "touch";
}): Promise<void> {
  try {
    const admin = createSupabaseAdmin();
    const { error } = await admin.from("token_usage_events").insert({
      user_id: input.userId,
      route: "other",
      model: null,
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
      cost_usd: 0,
      playbook_slug: null,
      feature: "obd_mileage_synced",
      metadata: {
        vehicle_id: input.vehicleId,
        mileage: input.mileage,
        unit: input.unit,
        previous_mileage: input.previousMileage,
        action: input.action,
      },
    });
    if (error) {
      console.warn("[obd/mileage-sync] feature event failed:", error.message);
    }
  } catch (err) {
    console.warn(
      "[obd/mileage-sync] feature event error:",
      err instanceof Error ? err.message : err,
    );
  }
}

/**
 * Write BLE OBD odometer (km from PID 0xA6) back to user_vehicles.mileage.
 * Requires has_obd_adapter = true. Never blocks the client on soft failures.
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
    odometerKm?: number | null;
  };

  const vehicleId =
    typeof body.vehicleId === "string" ? body.vehicleId.trim() : "";
  const odometerKm = Number(body.odometerKm);

  if (!vehicleId) {
    return NextResponse.json(
      { updated: false, skipped: "no_vehicle" as const },
      { status: 200 },
    );
  }

  if (
    !Number.isFinite(odometerKm) ||
    odometerKm <= 0 ||
    odometerKm > MAX_ODOMETER_KM
  ) {
    return NextResponse.json(
      { updated: false, skipped: "no_odometer" as const },
      { status: 200 },
    );
  }

  // Gate: Settings → I have an OBD-II adapter
  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("has_obd_adapter")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    if (!/has_obd_adapter|does not exist|schema cache/i.test(profileError.message)) {
      console.warn("[obd/mileage-sync] profile read:", profileError.message);
    }
    return NextResponse.json(
      { updated: false, skipped: "no_adapter" as const },
      { status: 200 },
    );
  }

  if (!canAttemptObdMileageWriteback(Boolean(profile?.has_obd_adapter), odometerKm)) {
    return NextResponse.json(
      { updated: false, skipped: "no_adapter" as const },
      { status: 200 },
    );
  }

  let vehicle: {
    id: string;
    mileage: number | null;
    mileage_unit?: string | null;
    market?: string | null;
    user_id: string;
  } | null = null;
  let columnsReady = true;

  {
    const full = await client
      .from("user_vehicles")
      .select("id, mileage, mileage_unit, market, user_id")
      .eq("id", vehicleId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (
      full.error &&
      /mileage_unit|does not exist|schema cache/i.test(full.error.message)
    ) {
      columnsReady = false;
      console.error(
        "[obd/mileage-sync] apply migration 035_user_vehicles_mileage_obd.sql:",
        full.error.message,
      );
      const fallback = await client
        .from("user_vehicles")
        .select("id, mileage, market, user_id")
        .eq("id", vehicleId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (fallback.error) {
        console.warn("[obd/mileage-sync] vehicle read:", fallback.error.message);
        return NextResponse.json(
          { updated: false, skipped: "no_vehicle" as const },
          { status: 200 },
        );
      }
      vehicle = fallback.data;
    } else if (full.error) {
      console.warn("[obd/mileage-sync] vehicle read:", full.error.message);
      return NextResponse.json(
        { updated: false, skipped: "no_vehicle" as const },
        { status: 200 },
      );
    } else {
      vehicle = full.data;
    }
  }

  if (!vehicle) {
    return NextResponse.json(
      { updated: false, skipped: "no_vehicle" as const },
      { status: 200 },
    );
  }

  const unit = normalizeMileageUnit(
    vehicle.mileage_unit,
    mileageUnitFromMarket(vehicle.market),
  );
  const nextMileage = convertOdometerKmToUnit(odometerKm, unit);
  const previousMileage = Math.max(0, Math.round(Number(vehicle.mileage) || 0));
  const decision = shouldWriteObdMileage(nextMileage, previousMileage);

  if (decision === "skip") {
    return NextResponse.json({
      updated: false,
      skipped: "not_newer" as const,
      mileage: previousMileage,
      unit,
      previousMileage,
    });
  }

  const now = new Date().toISOString();
  const richPatch =
    decision === "write"
      ? {
          mileage: nextMileage,
          mileage_updated_at: now,
          mileage_source: "obd" as const,
          mileage_unit: unit,
        }
      : {
          mileage_updated_at: now,
          mileage_source: "obd" as const,
          mileage_unit: unit,
        };
  const leanPatch =
    decision === "write" ? { mileage: nextMileage } : null;

  let updateError =
    columnsReady
      ? (
          await client
            .from("user_vehicles")
            .update(richPatch)
            .eq("id", vehicleId)
            .eq("user_id", user.id)
        ).error
      : leanPatch
        ? (
            await client
              .from("user_vehicles")
              .update(leanPatch)
              .eq("id", vehicleId)
              .eq("user_id", user.id)
          ).error
        : null;

  // touch-only with no metadata columns → nothing to write
  if (!columnsReady && decision === "touch") {
    return NextResponse.json({
      updated: false,
      touched: false,
      skipped: "not_newer" as const,
      mileage: previousMileage,
      unit,
      previousMileage,
    });
  }

  if (
    updateError &&
    /mileage_unit|mileage_source|mileage_updated_at|does not exist|schema cache/i.test(
      updateError.message,
    ) &&
    leanPatch
  ) {
    updateError = (
      await client
        .from("user_vehicles")
        .update(leanPatch)
        .eq("id", vehicleId)
        .eq("user_id", user.id)
    ).error;
  }

  if (updateError) {
    console.warn("[obd/mileage-sync] update failed:", updateError.message);
    return NextResponse.json(
      { updated: false, skipped: "write_failed" as const },
      { status: 200 },
    );
  }

  const storedMileage = decision === "write" ? nextMileage : previousMileage;

  void logObdMileageSynced({
    userId: user.id,
    vehicleId,
    mileage: storedMileage,
    unit,
    previousMileage,
    action: decision,
  });

  return NextResponse.json({
    updated: decision === "write",
    touched: decision === "touch",
    mileage: storedMileage,
    unit,
    previousMileage,
    message:
      decision === "write"
        ? `Vehicle mileage updated to ${formatMileageWithUnit(storedMileage, unit)}`
        : undefined,
  });
}
