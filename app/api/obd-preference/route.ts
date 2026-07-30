import { NextRequest, NextResponse } from "next/server";
import { createSupabaseUserClient } from "@/lib/supabase-admin";
import { parseObdAdapterPreference } from "@/lib/obd-preference";

export const runtime = "nodejs";

function getBearer(req: NextRequest): string | null {
  const h = req.headers.get("authorization");
  if (!h?.startsWith("Bearer ")) return null;
  return h.slice(7).trim() || null;
}

/** Read OBD adapter preference for the signed-in user. */
export async function GET(req: NextRequest) {
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

  const { data, error } = await client
    .from("profiles")
    .select(
      "has_obd_adapter, has_obd_adapter_source, has_obd_adapter_updated_at",
    )
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    if (/has_obd_adapter|does not exist|schema cache/i.test(error.message)) {
      return NextResponse.json({
        hasObdAdapter: false,
        preferenceUnset: true,
        source: "default",
      });
    }
    console.error("[obd-preference] read failed:", error.message);
    return NextResponse.json(
      { error: "Could not load OBD preference." },
      { status: 500 },
    );
  }

  const pref = parseObdAdapterPreference(data);
  return NextResponse.json({
    hasObdAdapter: pref.hasObdAdapter,
    preferenceUnset: pref.preferenceUnset,
    source: pref.source,
    updatedAt: pref.updatedAt,
  });
}

/** Self-report OBD adapter ownership from Settings / onboarding / first Connect. */
export async function PATCH(req: NextRequest) {
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
    hasObdAdapter?: boolean;
  };
  if (typeof body.hasObdAdapter !== "boolean") {
    return NextResponse.json(
      { error: "hasObdAdapter boolean required" },
      { status: 400 },
    );
  }

  const { error } = await client
    .from("profiles")
    .update({
      has_obd_adapter: body.hasObdAdapter,
      has_obd_adapter_source: "self",
      has_obd_adapter_updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) {
    if (/has_obd_adapter|does not exist|schema cache/i.test(error.message)) {
      console.error(
        "[obd-preference] column missing — apply migration 032_profiles_obd_adapter.sql:",
        error.message,
      );
      return NextResponse.json(
        {
          error:
            "Could not save OBD preference right now. Please try again later.",
        },
        { status: 500 },
      );
    }
    console.error("[obd-preference] update failed:", error.message);
    return NextResponse.json(
      { error: "Could not save OBD preference. Please try again." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    hasObdAdapter: body.hasObdAdapter,
    preferenceUnset: false,
    source: "self",
  });
}
