import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import {
  exportGoldenFinetuneJsonl,
  listGoldenQa,
  listReviewQueue,
  promoteReviewToKnowledge,
  updateReviewDraft,
  type FlywheelQueueStatus,
} from "@/lib/flywheel";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const view = sp.get("view") || "queue";

  try {
    if (view === "golden") {
      const golden = await listGoldenQa(Number(sp.get("limit") || 100) || 100);
      return NextResponse.json({ golden });
    }

    if (view === "export") {
      const markUsed = sp.get("markUsed") === "1";
      const onlyUnused = sp.get("onlyUnused") !== "0";
      const { lines, count, ids } = await exportGoldenFinetuneJsonl({
        markUsed,
        onlyUnused,
        limit: Number(sp.get("limit") || 500) || 500,
      });
      if (sp.get("download") === "1") {
        return new NextResponse(lines.join("\n") + (lines.length ? "\n" : ""), {
          headers: {
            "Content-Type": "application/x-ndjson; charset=utf-8",
            "Content-Disposition": `attachment; filename="golden-finetune-${Date.now()}.jsonl"`,
            "X-Golden-Count": String(count),
            "X-Golden-Ids": ids.join(",").slice(0, 2000),
          },
        });
      }
      return NextResponse.json({ count, ids, preview: lines.slice(0, 3) });
    }

    const status = (sp.get("status") || "pending") as
      | FlywheelQueueStatus
      | "all";
    const data = await listReviewQueue({
      status,
      limit: Number(sp.get("limit") || 50) || 50,
    });
    return NextResponse.json(data);
  } catch (err) {
    console.error("[/api/admin/flywheel]", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Failed to load flywheel",
      },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as {
      id?: string;
      action?: "save" | "reject" | "approve" | "promote";
      draftTitle?: string;
      draftQuestion?: string;
      draftAnswer?: string;
      draftCategory?: string;
    };

    if (!body.id?.trim()) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    if (body.action === "promote") {
      if (body.draftQuestion || body.draftAnswer || body.draftTitle) {
        await updateReviewDraft(body.id, {
          draftTitle: body.draftTitle,
          draftQuestion: body.draftQuestion,
          draftAnswer: body.draftAnswer,
          draftCategory: body.draftCategory,
        });
      }
      const result = await promoteReviewToKnowledge(body.id, {
        reviewedBy: "admin",
      });
      return NextResponse.json({ ok: true, ...result });
    }

    if (body.action === "reject") {
      const item = await updateReviewDraft(body.id, {
        status: "rejected",
        reviewedBy: "admin",
        draftTitle: body.draftTitle,
        draftQuestion: body.draftQuestion,
        draftAnswer: body.draftAnswer,
        draftCategory: body.draftCategory,
      });
      return NextResponse.json({ ok: true, item });
    }

    const item = await updateReviewDraft(body.id, {
      draftTitle: body.draftTitle,
      draftQuestion: body.draftQuestion,
      draftAnswer: body.draftAnswer,
      draftCategory: body.draftCategory,
      status: body.action === "approve" ? "approved" : undefined,
      reviewedBy: body.action === "approve" ? "admin" : undefined,
    });
    return NextResponse.json({ ok: true, item });
  } catch (err) {
    console.error("[/api/admin/flywheel PATCH]", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Failed to update",
      },
      { status: 500 },
    );
  }
}
