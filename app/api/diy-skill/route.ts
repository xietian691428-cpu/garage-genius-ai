import { NextRequest, NextResponse } from "next/server";
import { createSupabaseUserClient } from "@/lib/supabase-admin";
import {
  DIY_SKILL_LEVELS,
  normalizeDiySkill,
  type DiySkillLevel,
} from "@/lib/diy-skill";

export const runtime = "nodejs";

function getBearer(req: NextRequest): string | null {
  const h = req.headers.get("authorization");
  if (!h?.startsWith("Bearer ")) return null;
  return h.slice(7).trim() || null;
}

/** Read current DIY skill for the signed-in user. */
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
    .select("diy_skill, diy_skill_confidence, diy_skill_source, diy_skill_updated_at")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    if (/diy_skill|does not exist|schema cache/i.test(error.message)) {
      return NextResponse.json({
        diySkill: "beginner",
        confidence: 40,
        source: "default",
        migrationRequired: true,
      });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    diySkill: normalizeDiySkill(data?.diy_skill),
    confidence: data?.diy_skill_confidence ?? 40,
    source: data?.diy_skill_source ?? "default",
    updatedAt: data?.diy_skill_updated_at ?? null,
  });
}

/** Self-report DIY skill from onboarding / settings. */
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

  const body = (await req.json().catch(() => ({}))) as { diySkill?: string };
  const level = normalizeDiySkill(body.diySkill);
  if (!DIY_SKILL_LEVELS.includes(level as DiySkillLevel)) {
    return NextResponse.json({ error: "Invalid skill" }, { status: 400 });
  }

  const { error } = await client
    .from("profiles")
    .update({
      diy_skill: level,
      diy_skill_confidence: 70,
      diy_skill_source: "self",
      diy_skill_updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) {
    return NextResponse.json(
      {
        error: error.message,
        hint: /diy_skill/i.test(error.message)
          ? "Run migration 027_diy_skill.sql"
          : undefined,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, diySkill: level });
}
