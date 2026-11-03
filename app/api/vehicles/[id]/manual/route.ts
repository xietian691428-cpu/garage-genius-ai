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
  VEHICLE_MANUAL_BUCKET,
  VEHICLE_MANUAL_MAX_BYTES,
  getActiveVehicleManual,
  processUploadedManual,
  softDeleteVehicleManual,
  storagePathForManual,
  toManualClientDto,
} from "@/lib/vehicle-manuals";

export const runtime = "nodejs";
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

async function requireOwnedVehicle(req: NextRequest, vehicleId: string) {
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

/** GET /api/vehicles/:id/manual — status for this vehicle's private manual. */
export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const { id: vehicleId } = await ctx.params;
    const auth = await requireOwnedVehicle(req, vehicleId);
    if ("error" in auth && auth.error) return auth.error;
    const { userClient, user } = auth as Awaited<
      ReturnType<typeof requireOwnedVehicle>
    > & { userClient: ReturnType<typeof createSupabaseUserClient>; user: { id: string } };

    const row = await getActiveVehicleManual(userClient, user.id, vehicleId);
    const { listPendingExtracts, toExtractClientDto } = await import(
      "@/lib/vehicle-manual-extract"
    );
    const extracts = row
      ? (await listPendingExtracts(userClient, user.id, vehicleId)).map(
          toExtractClientDto,
        )
      : [];
    return NextResponse.json({
      manual: row ? toManualClientDto(row) : null,
      extracts,
    });
  } catch (err) {
    const blocked = aiAbuseResponse(err);
    if (blocked) return blocked;
    console.error("[/api/vehicles/:id/manual GET]", err);
    return NextResponse.json(
      { error: "Could not load manual status." },
      { status: 500 },
    );
  }
}

/** POST multipart PDF — private to this user × vehicle only. */
export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { id: vehicleId } = await ctx.params;
    const auth = await requireOwnedVehicle(req, vehicleId);
    if ("error" in auth && auth.error) return auth.error;
    const { userClient, user, vehicle } = auth as Awaited<
      ReturnType<typeof requireOwnedVehicle>
    > & {
      userClient: ReturnType<typeof createSupabaseUserClient>;
      user: { id: string };
      vehicle: NonNullable<
        Awaited<ReturnType<typeof loadOwnedGarageVehicle>>
      >;
    };

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "PDF file is required (field: file)." },
        { status: 400 },
      );
    }
    const filename = (file.name || "manual.pdf").slice(0, 180);
    const mime = (file.type || "").toLowerCase();
    if (mime && mime !== "application/pdf") {
      return NextResponse.json(
        { error: "PDF only. Text-layer PDFs work best." },
        { status: 400 },
      );
    }
    if (!/\.pdf$/i.test(filename) && mime !== "application/pdf") {
      return NextResponse.json(
        { error: "PDF only. Text-layer PDFs work best." },
        { status: 400 },
      );
    }
    if (file.size <= 0 || file.size > VEHICLE_MANUAL_MAX_BYTES) {
      return NextResponse.json(
        {
          error: `File must be under ${Math.floor(VEHICLE_MANUAL_MAX_BYTES / (1024 * 1024))} MB.`,
        },
        { status: 400 },
      );
    }

    // Replace any prior active manual for this vehicle (one current copy).
    await softDeleteVehicleManual({
      client: userClient,
      userId: user.id,
      vehicleId,
      removeStorage: true,
    });

    const manualId = crypto.randomUUID();
    const path = storagePathForManual({
      userId: user.id,
      vehicleId,
      manualId,
    });
    const bytes = Buffer.from(await file.arrayBuffer());

    const { error: upErr } = await userClient.storage
      .from(VEHICLE_MANUAL_BUCKET)
      .upload(path, bytes, {
        contentType: "application/pdf",
        upsert: true,
      });
    if (upErr) {
      console.error("[manual upload storage]", upErr);
      return NextResponse.json(
        { error: "Could not store PDF. Try again." },
        { status: 500 },
      );
    }

    const { data: inserted, error: insErr } = await userClient
      .from("vehicle_manuals")
      .insert({
        id: manualId,
        user_id: user.id,
        vehicle_id: vehicleId,
        storage_path: path,
        original_filename: filename,
        file_size: file.size,
        status: "processing",
        ymm_match: "unknown",
        user_confirmed_match: false,
      })
      .select("*")
      .single();
    if (insErr || !inserted) {
      await userClient.storage.from(VEHICLE_MANUAL_BUCKET).remove([path]);
      console.error("[manual insert]", insErr);
      return NextResponse.json(
        { error: "Could not save manual record." },
        { status: 500 },
      );
    }

    try {
      const ready = await processUploadedManual({
        client: userClient,
        userId: user.id,
        vehicleId,
        manualId,
        bytes,
        vehicle,
      });
      return NextResponse.json({ manual: toManualClientDto(ready) });
    } catch (err) {
      console.error("[manual process]", err);
      const { data: failed } = await userClient
        .from("vehicle_manuals")
        .update({
          status: "failed",
          error_message:
            err instanceof Error
              ? err.message.slice(0, 300)
              : "Processing failed.",
        })
        .eq("id", manualId)
        .eq("user_id", user.id)
        .select("*")
        .maybeSingle();
      return NextResponse.json(
        {
          manual: failed ? toManualClientDto(failed as never) : null,
          error: "Could not process PDF text.",
        },
        { status: 422 },
      );
    }
  } catch (err) {
    const blocked = aiAbuseResponse(err);
    if (blocked) return blocked;
    console.error("[/api/vehicles/:id/manual POST]", err);
    return NextResponse.json(
      { error: "Could not upload manual." },
      { status: 500 },
    );
  }
}

/** DELETE — soft-delete + remove chunks + storage object. */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  try {
    const { id: vehicleId } = await ctx.params;
    const auth = await requireOwnedVehicle(req, vehicleId);
    if ("error" in auth && auth.error) return auth.error;
    const { userClient, user } = auth as Awaited<
      ReturnType<typeof requireOwnedVehicle>
    > & { userClient: ReturnType<typeof createSupabaseUserClient>; user: { id: string } };

    await softDeleteVehicleManual({
      client: userClient,
      userId: user.id,
      vehicleId,
      removeStorage: true,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const blocked = aiAbuseResponse(err);
    if (blocked) return blocked;
    console.error("[/api/vehicles/:id/manual DELETE]", err);
    return NextResponse.json(
      { error: "Could not delete manual." },
      { status: 500 },
    );
  }
}
