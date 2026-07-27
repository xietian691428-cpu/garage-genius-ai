import { NextRequest, NextResponse } from "next/server";
import { createSupabaseUserClient } from "@/lib/supabase-admin";
import {
  adoptCoachStepAsKnowledge,
  type CoachAdoptKnowledgeInput,
} from "@/lib/coach-adopt-knowledge";
import type { CoachAdoptKnowledgeRequest } from "@/lib/types/coach-scenario";

export const runtime = "nodejs";

/**
 * Adopt current Coach step content into knowledge_base (RAG).
 * Auth required. Does not change playbook JSON.
 */
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return NextResponse.json(
      { error: "Sign in required", code: "AUTH_REQUIRED" },
      { status: 401 },
    );
  }

  const token = auth.slice(7).trim();
  const userClient = createSupabaseUserClient(token);
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "Sign in required", code: "AUTH_REQUIRED" },
      { status: 401 },
    );
  }

  let body: CoachAdoptKnowledgeRequest;
  try {
    body = (await req.json()) as CoachAdoptKnowledgeRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (
    !body?.scenario_slug ||
    !body?.scenario_id ||
    !body?.step_id ||
    !body?.title?.trim() ||
    !body?.description?.trim()
  ) {
    return NextResponse.json(
      { error: "Missing scenario/step/title/description" },
      { status: 400 },
    );
  }

  if (body.last_vote !== "yes") {
    return NextResponse.json(
      {
        error: "Mark the step useful (Yes) before adopting",
        code: "VOTE_YES_REQUIRED",
      },
      { status: 400 },
    );
  }

  const input: CoachAdoptKnowledgeInput = {
    scenarioSlug: body.scenario_slug,
    scenarioId: body.scenario_id,
    stepId: body.step_id,
    title: body.title,
    description: body.description,
    coachEncourage: body.coach_encourage,
    safetyWarning: body.safety_warning,
    trustNudge: body.trust_nudge,
    personalize: body.personalize,
    kind: body.kind === "completion" ? "completion" : "step",
    qualityScore: body.quality_score,
    lastVote: body.last_vote ?? null,
    vehicleMake: body.vehicle_make,
    vehicleModel: body.vehicle_model,
    vehicleYears: body.vehicle_years,
    userId: user.id,
  };

  try {
    const result = await adoptCoachStepAsKnowledge(input);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[/api/coach/adopt-knowledge]", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to adopt knowledge",
      },
      { status: 500 },
    );
  }
}
