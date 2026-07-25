import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { CoachStepFeedbackPayload } from "@/lib/types/coach-scenario";

export const runtime = "nodejs";

function getUserClient(authHeader: string | null) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anon || !authHeader?.startsWith("Bearer ")) return null;
  return createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function POST(req: Request) {
  let body: CoachStepFeedbackPayload;
  try {
    body = (await req.json()) as CoachStepFeedbackPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body?.scenario_slug || !body?.scenario_id || !body?.step_id) {
    return NextResponse.json({ error: "Missing scenario/step" }, { status: 400 });
  }
  if (body.vote !== "yes" && body.vote !== "no") {
    return NextResponse.json({ error: "vote must be yes|no" }, { status: 400 });
  }

  const authHeader = req.headers.get("authorization");
  const supabase = getUserClient(authHeader);

  // Always acknowledge — never block the coach UX if DB is unavailable.
  if (!supabase) {
    console.info("[coach/feedback]", body.scenario_slug, body.step_id, body.vote);
    return NextResponse.json({ ok: true, stored: false });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    console.info("[coach/feedback:anon]", body.scenario_slug, body.step_id, body.vote);
    return NextResponse.json({ ok: true, stored: false });
  }

  const { error } = await supabase.from("coach_step_feedback").insert({
    user_id: user.id,
    scenario_slug: body.scenario_slug,
    scenario_id: body.scenario_id,
    step_id: body.step_id,
    vote: body.vote,
    vehicle_mileage: body.vehicle_mileage ?? null,
    vehicle_make: body.vehicle_make ?? null,
    vehicle_model: body.vehicle_model ?? null,
    note: body.note?.slice(0, 500) ?? null,
    client_session_id: body.client_session_id ?? null,
  });

  if (error) {
    console.warn("[coach/feedback] insert failed", error.message);
    return NextResponse.json({ ok: true, stored: false, warning: error.message });
  }

  return NextResponse.json({ ok: true, stored: true });
}
