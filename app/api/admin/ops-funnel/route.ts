import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { getOpsFunnel } from "@/lib/admin-ops-funnel";

export const runtime = "nodejs";

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    return NextResponse.json(await getOpsFunnel());
  } catch (err) {
    console.error("[/api/admin/ops-funnel]", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Failed to load funnel",
      },
      { status: 500 },
    );
  }
}
