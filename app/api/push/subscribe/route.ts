import { NextRequest, NextResponse } from "next/server";
import { createSupabaseUserClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";

function getAccessToken(req: NextRequest): string | null {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim() || null;
}

/**
 * Save a Web Push subscription for the signed-in user.
 * Body: { endpoint, keys: { p256dh, auth }, userAgent? }
 */
export async function POST(req: NextRequest) {
  const token = getAccessToken(req);
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseUserClient(token);
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
    userAgent?: string;
  } | null;

  const endpoint = body?.endpoint?.trim();
  const p256dh = body?.keys?.p256dh?.trim();
  const auth = body?.keys?.auth?.trim();
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json(
      { error: "endpoint and keys.p256dh / keys.auth are required" },
      { status: 400 },
    );
  }

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint,
      p256dh,
      auth,
      user_agent: body?.userAgent?.slice(0, 400) || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,endpoint" },
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const token = getAccessToken(req);
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseUserClient(token);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as {
    endpoint?: string;
  } | null;

  let query = supabase
    .from("push_subscriptions")
    .delete()
    .eq("user_id", user.id);
  if (body?.endpoint) {
    query = query.eq("endpoint", body.endpoint);
  }

  const { error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
