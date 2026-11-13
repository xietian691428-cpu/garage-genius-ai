import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import {
  draftGoldCaseFromMiss,
  validateGoldCaseDraft,
  type MissDimension,
  type MissFeedbackStatus,
} from "@/lib/pilot/miss-feedback";
import {
  getMissFeedback,
  listMissFeedback,
  updateMissFeedback,
} from "@/lib/pilot/miss-feedback-store";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const id = sp.get("id");
  if (id) {
    const item = await getMissFeedback(id);
    if (!item) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ item });
  }

  const data = await listMissFeedback({
    status: (sp.get("status") as MissFeedbackStatus | "all") || "pending",
    dimension: (sp.get("dimension") as MissDimension | "") || "",
    limit: Number(sp.get("limit") || 50) || 50,
  });
  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as {
      id?: string;
      action?: "dismiss" | "reviewed" | "promote_draft";
      notes?: string;
      sampleGood?: string;
    };

    if (!body.id?.trim()) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    const item = await getMissFeedback(body.id);
    if (!item) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (body.action === "dismiss") {
      const r = await updateMissFeedback(body.id, {
        status: "dismissed",
        notes: body.notes,
        reviewedBy: "admin",
      });
      return NextResponse.json(r);
    }

    if (body.action === "reviewed") {
      const r = await updateMissFeedback(body.id, {
        status: "reviewed",
        notes: body.notes,
        reviewedBy: "admin",
      });
      return NextResponse.json(r);
    }

    if (body.action === "promote_draft") {
      const draft = draftGoldCaseFromMiss(item, {
        idSuffix: item.id?.slice(0, 8),
      });
      if (body.sampleGood?.trim()) {
        draft.expect.sample_good = body.sampleGood.trim();
      }
      const validation = validateGoldCaseDraft(draft);
      const r = await updateMissFeedback(body.id, {
        status: "promoted_draft",
        notes: body.notes,
        goldDraft: draft,
        reviewedBy: "admin",
      });
      return NextResponse.json({
        ok: r.ok,
        error: r.error,
        draft,
        validation,
        mergeHint:
          "Copy draft into content/pilot/gold-cases.json (after filling sample_good), then run npm run test:gold-cases. Do not auto-merge.",
      });
    }

    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "failed" },
      { status: 500 },
    );
  }
}
