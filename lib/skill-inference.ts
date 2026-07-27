/**
 * Soft DIY skill inference from real signals (not coach_playbook_usage — that
 * table is quota-only and has no playbook slugs).
 */

import { createSupabaseAdmin } from "@/lib/supabase-admin";
import {
  normalizeDiySkill,
  type DiySkillLevel,
  type DiySkillSource,
} from "@/lib/diy-skill";

export type SkillInferenceResult = {
  suggested: DiySkillLevel;
  confidence: number;
  score: number;
  reasons: string[];
};

const BEGINNER_PHRASES =
  /\b(what is|what'?s a|how do i|explain|beginner|first time|never done|scared|afraid|扭矩是什么|什么是)\b/i;
const ADVANCED_PHRASES =
  /\b(torque spec|oscilloscope|waveform|pid|freeze frame|scope|scan tool|oem procedure|ft-?lb|nm\b|dtc logic)\b/i;

/**
 * Heuristic 0–100 score from coach feedback + recent chat snippets.
 * Higher → more advanced.
 */
export async function inferDiySkillScore(
  userId: string,
): Promise<SkillInferenceResult> {
  const admin = createSupabaseAdmin();
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const reasons: string[] = [];
  let score = 45;

  const [feedbackRes, chatRes, profileRes] = await Promise.all([
    admin
      .from("coach_step_feedback")
      .select("vote, scenario_slug, note, created_at")
      .eq("user_id", userId)
      .gte("created_at", since)
      .limit(200),
    admin
      .from("chat_messages")
      .select("role, content")
      .eq("user_id", userId)
      .eq("role", "user")
      .order("created_at", { ascending: false })
      .limit(40),
    admin
      .from("profiles")
      .select("diy_skill, diy_skill_confidence, diy_skill_source, diy_skill_updated_at")
      .eq("id", userId)
      .maybeSingle(),
  ]);

  const feedback = feedbackRes.data ?? [];
  const yes = feedback.filter((f) => f.vote === "yes").length;
  const no = feedback.filter((f) => f.vote === "no").length;
  const totalVotes = yes + no;

  if (totalVotes >= 3) {
    const usefulRate = yes / totalVotes;
    if (usefulRate < 0.55) {
      score -= 18;
      reasons.push(`coach useful rate ${(usefulRate * 100).toFixed(0)}% → easier tone`);
    } else if (usefulRate > 0.8 && totalVotes >= 5) {
      score += 10;
      reasons.push("high coach useful rate → can go deeper");
    }
  }

  // Advanced-ish playbook slugs (scenario names) → slight bump
  const advancedSlugs = feedback.filter((f) =>
    /electrical|injectors|exhaust|emissions|classic|modified|luxury/i.test(
      String(f.scenario_slug || ""),
    ),
  ).length;
  if (advancedSlugs >= 2) {
    score += 8;
    reasons.push("completed advanced-leaning coach scenarios");
  }

  let beginnerHits = 0;
  let advancedHits = 0;
  for (const m of chatRes.data ?? []) {
    const text = String(m.content || "");
    if (BEGINNER_PHRASES.test(text)) beginnerHits += 1;
    if (ADVANCED_PHRASES.test(text)) advancedHits += 1;
  }
  if (beginnerHits >= 2) {
    score -= 20;
    reasons.push(`repeated beginner-style questions (${beginnerHits})`);
  }
  if (advancedHits >= 2) {
    score += 15;
    reasons.push(`advanced terminology in chat (${advancedHits})`);
  }

  // Respect strong self-report: don't swing far from self unless confidence low
  const current = normalizeDiySkill(profileRes.data?.diy_skill);
  const source = (profileRes.data?.diy_skill_source || "default") as DiySkillSource;
  if (source === "self" || source === "manual") {
    const anchor =
      current === "beginner" ? 30 : current === "enthusiast" ? 55 : 80;
    score = Math.round(score * 0.45 + anchor * 0.55);
    reasons.push("anchored to self-reported skill");
  }

  score = Math.max(0, Math.min(100, score));

  let suggested: DiySkillLevel = "enthusiast";
  if (score < 40) suggested = "beginner";
  else if (score >= 70) suggested = "professional";

  // Force beginner if strong jargon confusion signal
  if (beginnerHits >= 3) {
    suggested = "beginner";
    reasons.push("forced beginner: repeated ‘what is…’ style questions");
  }

  const confidence = Math.min(
    95,
    35 + totalVotes * 4 + beginnerHits * 5 + advancedHits * 5,
  );

  return { suggested, confidence, score, reasons };
}

export type SkillAdjustResult = {
  userId: string;
  from: DiySkillLevel;
  to: DiySkillLevel;
  changed: boolean;
  reasons: string[];
  notified: boolean;
};

/**
 * Apply inferred skill if it differs and confidence is high enough.
 * Self-report is sticky unless downvote pressure is strong.
 */
export async function maybeAdjustDiySkill(
  userId: string,
  options?: { force?: boolean; notify?: boolean },
): Promise<SkillAdjustResult> {
  const admin = createSupabaseAdmin();
  const { data: profile } = await admin
    .from("profiles")
    .select(
      "diy_skill, diy_skill_source, diy_skill_confidence, diy_skill_updated_at",
    )
    .eq("id", userId)
    .maybeSingle();

  const from = normalizeDiySkill(profile?.diy_skill);
  const source = (profile?.diy_skill_source || "default") as DiySkillSource;
  const inference = await inferDiySkillScore(userId);

  // Rate-limit: skip if updated in last 5 days unless force
  if (!options?.force && profile?.diy_skill_updated_at) {
    const age =
      Date.now() - new Date(profile.diy_skill_updated_at as string).getTime();
    if (age < 5 * 24 * 60 * 60 * 1000) {
      return {
        userId,
        from,
        to: from,
        changed: false,
        reasons: ["skipped: updated within 5 days", ...inference.reasons],
        notified: false,
      };
    }
  }

  let to = inference.suggested;

  // Sticky self-report: only demote on strong signal, never jump beginner→pro in one step
  if (source === "self" && !options?.force) {
    if (from === "professional" && to === "beginner") to = "enthusiast";
    if (from === "beginner" && to === "professional") to = "enthusiast";
    if (from === to) {
      return {
        userId,
        from,
        to,
        changed: false,
        reasons: inference.reasons,
        notified: false,
      };
    }
    // Only change self-report if confidence high and score clearly off-band
    if (inference.confidence < 60) {
      return {
        userId,
        from,
        to: from,
        changed: false,
        reasons: ["kept self-report (low inference confidence)", ...inference.reasons],
        notified: false,
      };
    }
  }

  if (to === from) {
    return {
      userId,
      from,
      to,
      changed: false,
      reasons: inference.reasons,
      notified: false,
    };
  }

  await admin
    .from("profiles")
    .update({
      diy_skill: to,
      diy_skill_confidence: inference.confidence,
      diy_skill_source: "inferred",
      diy_skill_updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  let notified = false;
  if (options?.notify !== false) {
    notified = await notifySkillChange(userId, from, to);
  }

  return {
    userId,
    from,
    to,
    changed: true,
    reasons: inference.reasons,
    notified,
  };
}

async function notifySkillChange(
  userId: string,
  from: DiySkillLevel,
  to: DiySkillLevel,
): Promise<boolean> {
  try {
    const admin = createSupabaseAdmin();
    const { data: vehicle } = await admin
      .from("user_vehicles")
      .select("id")
      .eq("user_id", userId)
      .is("archived_at", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!vehicle?.id) return false;

    const upgrading =
      (from === "beginner" && to !== "beginner") ||
      (from === "enthusiast" && to === "professional");

    const title = upgrading
      ? "Coaching mode updated"
      : "We simplified your coaching tone";
    const body = upgrading
      ? `Detected stronger DIY signals — switched from ${from} to ${to}. You can change this anytime in Settings.`
      : `Recent feedback suggests answers may have been too advanced — switched from ${from} to ${to}. Change anytime in Settings.`;

    const { error } = await admin.from("reminder_deliveries").insert({
      user_id: userId,
      vehicle_id: vehicle.id,
      channel: "in_app",
      reason: "diy_skill_change",
      title,
      body,
    });
    if (error) {
      console.warn("[skill] notify", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[skill] notify failed", err);
    return false;
  }
}

/** Immediate soft nudge after coach downvote (does not jump levels alone). */
export async function onCoachFeedbackSkillSignal(
  userId: string,
  vote: "yes" | "no",
): Promise<void> {
  try {
    const admin = createSupabaseAdmin();
    const { data } = await admin
      .from("profiles")
      .select("diy_skill, diy_skill_confidence, diy_skill_source")
      .eq("id", userId)
      .maybeSingle();
    if (!data) return;

    let confidence = Number(data.diy_skill_confidence) || 40;
    if (vote === "no") confidence = Math.max(10, confidence - 8);
    else confidence = Math.min(95, confidence + 3);

    const patch: Record<string, unknown> = {
      diy_skill_confidence: confidence,
    };

    // Only auto-demote beginner←enthusiast on repeated low confidence + recent nos
    if (vote === "no" && confidence <= 25) {
      const level = normalizeDiySkill(data.diy_skill);
      if (level === "professional") {
        patch.diy_skill = "enthusiast";
        patch.diy_skill_source = "inferred";
        patch.diy_skill_updated_at = new Date().toISOString();
      } else if (level === "enthusiast" && data.diy_skill_source !== "self") {
        patch.diy_skill = "beginner";
        patch.diy_skill_source = "inferred";
        patch.diy_skill_updated_at = new Date().toISOString();
      }
    }

    await admin.from("profiles").update(patch).eq("id", userId);
  } catch (err) {
    console.warn("[skill] feedback signal", err);
  }
}
