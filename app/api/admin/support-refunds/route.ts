import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import {
  approveAndExecuteRefund,
  rejectRefundRequest,
} from "@/lib/stripe-support";

export const runtime = "nodejs";

/** GET — pending refund requests for admin review */
export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("subscription_support_requests")
    .select("*")
    .eq("kind", "refund")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, requests: data ?? [] });
}

/**
 * POST — human approve (executes Stripe refund) or reject.
 * Body: { requestId, action: "approve" | "reject", note? }
 */
export async function POST(req: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as {
    requestId?: string;
    action?: "approve" | "reject";
    note?: string;
  };

  if (!body.requestId || !body.action) {
    return NextResponse.json(
      { error: "requestId and action required" },
      { status: 400 },
    );
  }

  const adminEmail = process.env.ADMIN_EMAIL?.trim() || "admin";

  try {
    if (body.action === "approve") {
      const { refundId } = await approveAndExecuteRefund({
        requestId: body.requestId,
        adminEmail,
        note: body.note,
      });
      return NextResponse.json({
        ok: true,
        refundId,
        message: "Refund executed in Stripe after human approval",
      });
    }

    await rejectRefundRequest({
      requestId: body.requestId,
      adminEmail,
      note: body.note,
    });
    return NextResponse.json({ ok: true, status: "rejected" });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Action failed" },
      { status: 500 },
    );
  }
}
