import { NextRequest, NextResponse } from "next/server";
import {
  aiAbuseResponse,
  requireVerifiedAiUser,
} from "@/lib/ai-abuse";
import {
  assertAndConsumePlaybookRun,
  getPlaybookQuota,
} from "@/lib/playbook-limits";
import { paywallResponse } from "@/lib/subscription-guard";

export const runtime = "nodejs";

/** GET — current 30-day (from signup) playbook quota for the signed-in user */
export async function GET(req: NextRequest) {
  try {
    const user = await requireVerifiedAiUser(req);
    const quota = await getPlaybookQuota(user.id);
    return NextResponse.json({ ok: true, quota });
  } catch (err) {
    return (
      paywallResponse(err) ||
      aiAbuseResponse(err) ||
      NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    );
  }
}

/**
 * POST — start a coach playbook (consumes Free 30-day quota from registration).
 * Body: { playbookSlug?: string }
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireVerifiedAiUser(req);
    let playbookSlug: string | null = null;
    try {
      const body = (await req.json()) as { playbookSlug?: string };
      playbookSlug = body.playbookSlug?.trim() || null;
    } catch {
      /* empty body ok */
    }

    const result = await assertAndConsumePlaybookRun(user.id, playbookSlug);
    if (!result.ok) {
      return NextResponse.json(
        {
          error:
            "Free plan includes 5 coach playbook starts every 30 days from signup. Upgrade to Pro for unlimited guides.",
          code: "playbook_limit",
          reason: "playbook",
          quota: result.quota,
        },
        { status: 402 },
      );
    }

    return NextResponse.json({ ok: true, quota: result.quota });
  } catch (err) {
    return (
      paywallResponse(err) ||
      aiAbuseResponse(err) ||
      NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    );
  }
}
